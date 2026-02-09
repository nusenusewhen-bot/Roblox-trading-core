import discord
from discord.ext import commands
from discord.ui import View, Button, Modal, TextInput
import os
import datetime
import io

TOKEN = os.environ["TOKEN"]

# ---------- IDS ----------
TICKET_CATEGORY_ID = 1469111714955001976
LOG_CHANNEL_ID = 1469111771137577154

INDEX_MIDDLEMAN_ROLE = 1469111696554594459
SUPPORT_MIDDLEMAN_ROLE = 1469111692087529484
FORCE_UNCLAIM_USER = 1298640383688970293

COMMAND_OWNER = 1298640383688970293

# ---------- BOT ----------
intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="$", intents=intents)


# ---------- HELPERS ----------
def owner_only():
    async def predicate(ctx):
        return ctx.author.id == COMMAND_OWNER
    return commands.check(predicate)


def is_staff(member):
    return any(
        r.id in (INDEX_MIDDLEMAN_ROLE, SUPPORT_MIDDLEMAN_ROLE)
        for r in member.roles
    )


# ---------- TICKET VIEW ----------
class TicketControls(View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Claim", style=discord.ButtonStyle.success)
    async def claim(self, interaction: discord.Interaction, _):
        if not is_staff(interaction.user):
            return await interaction.response.send_message("❌ No permission.", ephemeral=True)

        topic = interaction.channel.topic or ""
        if "claimed:" in topic:
            return await interaction.response.send_message("❌ Already claimed.", ephemeral=True)

        await interaction.channel.edit(topic=topic + f" | claimed:{interaction.user.id}")

        for role in interaction.guild.roles:
            if role.id in (INDEX_MIDDLEMAN_ROLE, SUPPORT_MIDDLEMAN_ROLE):
                await interaction.channel.set_permissions(role, send_messages=False)

        await interaction.channel.set_permissions(interaction.user, send_messages=True)

        self.claim.style = discord.ButtonStyle.danger
        await interaction.response.edit_message(view=self)
        await interaction.channel.send(f"🟢 {interaction.user.mention} has claimed ticket")

    @discord.ui.button(label="Unclaim", style=discord.ButtonStyle.secondary)
    async def unclaim(self, interaction: discord.Interaction, _):
        topic = interaction.channel.topic or ""

        if "claimed:" not in topic:
            return await interaction.response.send_message("❌ Not claimed.", ephemeral=True)

        claimed_id = int(topic.split("claimed:")[1])

        if interaction.user.id not in (claimed_id, FORCE_UNCLAIM_USER):
            return await interaction.response.send_message("❌ You can’t unclaim.", ephemeral=True)

        await interaction.channel.edit(topic=topic.split(" | claimed:")[0])

        for role in interaction.guild.roles:
            if role.id in (INDEX_MIDDLEMAN_ROLE, SUPPORT_MIDDLEMAN_ROLE):
                await interaction.channel.set_permissions(role, send_messages=True)

        self.claim.style = discord.ButtonStyle.success
        await interaction.response.edit_message(view=self)
        await interaction.channel.send("🔓 Ticket unclaimed, staff can now claim.")

    @discord.ui.button(label="Close", style=discord.ButtonStyle.danger)
    async def close(self, interaction: discord.Interaction, _):
        messages = []
        async for msg in interaction.channel.history(limit=None, oldest_first=True):
            messages.append(f"[{msg.created_at}] {msg.author}: {msg.content}")

        transcript = "\n".join(messages)
        file = discord.File(
            io.BytesIO(transcript.encode()),
            filename=f"{interaction.channel.name}.txt"
        )

        log = interaction.guild.get_channel(LOG_CHANNEL_ID)
        if log:
            await log.send(
                content=f"Transcript for **{interaction.channel.name}**",
                file=file
            )

        await interaction.channel.delete()


# ---------- MODALS ----------
class TradeModal(Modal, title="Trade Request"):
    user = TextInput(label="User / ID of other person", max_length=100)
    desc = TextInput(label="Description", style=discord.TextStyle.paragraph)
    ps = TextInput(label="Can both join PS link?", required=False)

    async def on_submit(self, interaction: discord.Interaction):
        await create_ticket(interaction, "trade", self)


class IndexModal(Modal, title="Index Request"):
    item = TextInput(label="What would you like to index?")
    hold = TextInput(label="What are you letting us hold?")
    obey = TextInput(label="Will you obey staff commands?")

    async def on_submit(self, interaction: discord.Interaction):
        await create_ticket(interaction, "index", self)


class SupportModal(Modal, title="Support"):
    help = TextInput(label="What do you need help with?")
    proof = TextInput(label="Do you have any proofs?")
    wait = TextInput(label="Will you wait patiently?")

    async def on_submit(self, interaction):
        await create_ticket(interaction, "support", self)


class ReportModal(Modal, title="Report"):
    user = TextInput(label="Who are you reporting?")
    reason = TextInput(label="What did he do?", style=discord.TextStyle.paragraph)
    proof = TextInput(label="Do you have any proofs?")

    async def on_submit(self, interaction):
        await create_ticket(interaction, "report", self)


# ---------- VIEWS ----------
class TradeView(View):
    @discord.ui.button(label="Request", style=discord.ButtonStyle.primary)
    async def request(self, interaction, _):
        await interaction.response.send_modal(TradeModal())


class IndexView(View):
    @discord.ui.button(label="Request", style=discord.ButtonStyle.primary)
    async def request(self, interaction, _):
        await interaction.response.send_modal(IndexModal())


class SupportSelect(View):
    @discord.ui.button(label="Select", style=discord.ButtonStyle.blurple)
    async def select(self, interaction, _):
        await interaction.response.send_message(
            "Choose ticket type:",
            view=SupportOptions(),
            ephemeral=True
        )


class SupportOptions(View):
    @discord.ui.button(label="Support", style=discord.ButtonStyle.success)
    async def support(self, interaction, _):
        await interaction.response.send_modal(SupportModal())

    @discord.ui.button(label="Report", style=discord.ButtonStyle.danger)
    async def report(self, interaction, _):
        await interaction.response.send_modal(ReportModal())


# ---------- TICKET CREATION ----------
async def create_ticket(interaction, ttype, modal):
    guild = interaction.guild
    category = guild.get_channel(TICKET_CATEGORY_ID)

    channel = await guild.create_text_channel(
        f"{ttype}-{interaction.user.name}",
        category=category,
        topic=f"creator:{interaction.user.id}"
    )

    await channel.set_permissions(interaction.user, view_channel=True, send_messages=True)

    embed = discord.Embed(title=f"{ttype.title()} Ticket", color=discord.Color.blue())
    for child in modal.children:
        embed.add_field(name=child.label, value=child.value, inline=False)

    await channel.send(embed=embed, view=TicketControls())
    await interaction.response.send_message("✅ Ticket created.", ephemeral=True)


# ---------- COMMANDS ----------
@bot.command()
@owner_only()
async def main(ctx):
    embed = discord.Embed(
        title="Middleman Trading Service",
        description=(
            "**Need a trusted middleman for your trade?**\n\n"
            "• Safe middleman service\n"
            "• Scam prevention\n"
            "• Verified staff\n\n"
            "Click **Request** to open a trade ticket."
        ),
        color=discord.Color.blue()
    )
    embed.set_image(url="https://i.ibb.co/JF73d5JF/ezgif-4b693c75629087.gif")
    await ctx.send(embed=embed, view=TradeView())


@bot.command()
@owner_only()
async def index(ctx):
    embed = discord.Embed(
        title="Indexing Service",
        description=(
            "Open an indexing ticket if you need items indexed.\n\n"
            "• Payment must be ready\n"
            "• Follow staff instructions\n"
            "• Be patient"
        ),
        color=discord.Color.blue()
    )
    embed.set_image(url="https://i.ibb.co/JF73d5JF/ezgif-4b693c75629087.gif")
    await ctx.send(embed=embed, view=IndexView())


@bot.command()
@owner_only()
async def support(ctx):
    embed = discord.Embed(
        title="Support / Report",
        description=(
            "Hello welcome to support/report.\n\n"
            "1. Come with proof\n"
            "2. Staff has final say\n"
            "3. Do not be rude\n\n"
            "Click **Select** below."
        ),
        color=discord.Color.blue()
    )
    await ctx.send(embed=embed, view=SupportSelect())


# ---------- START ----------
bot.run(TOKEN)
