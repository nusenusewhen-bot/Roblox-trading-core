import discord
from discord.ext import commands
import config
import io

intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.guilds = True

bot = commands.Bot(command_prefix="$", intents=intents)

# ---------------- HELPERS ----------------

def owner_only():
    async def predicate(ctx):
        return ctx.author.id == config.COMMAND_OWNER
    return commands.check(predicate)

def is_ticket_channel(channel):
    return channel.category and channel.category.id == config.TICKET_CATEGORY_ID

def is_staff(member):
    return any(r.id in (
        config.INDEX_MIDDLEMAN_ROLE,
        config.SUPPORT_STAFF_ROLE
    ) for r in member.roles)

def make_topic(creator, claimed="none"):
    return f"{creator} | {claimed}"

def read_topic(channel):
    if not channel.topic:
        return None, "none"
    c, cl = channel.topic.split("|")
    return int(c.strip()), cl.strip()

# ---------------- TICKET BUTTONS ----------------

class TicketControls(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Claim", style=discord.ButtonStyle.success)
    async def claim(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_staff(interaction.user):
            return await interaction.response.send_message("You cannot claim this ticket.", ephemeral=True)

        creator, claimed = read_topic(interaction.channel)
        if claimed != "none":
            return await interaction.response.send_message("Ticket already claimed.", ephemeral=True)

        await interaction.channel.edit(topic=make_topic(creator, interaction.user.id))

        for role_id in (config.INDEX_MIDDLEMAN_ROLE, config.SUPPORT_STAFF_ROLE):
            role = interaction.guild.get_role(role_id)
            if role:
                await interaction.channel.set_permissions(role, send_messages=False)

        await interaction.channel.set_permissions(interaction.user, send_messages=True)

        await interaction.response.send_message(
            f"{interaction.user.mention} has claimed ticket."
        )

    @discord.ui.button(label="Unclaim", style=discord.ButtonStyle.danger)
    async def unclaim(self, interaction: discord.Interaction, button: discord.ui.Button):
        creator, claimed = read_topic(interaction.channel)

        if claimed == "none":
            return await interaction.response.send_message("Ticket is not claimed.", ephemeral=True)

        if interaction.user.id != int(claimed) and interaction.user.id != config.FORCE_UNCLAIM_USER:
            return await interaction.response.send_message("You cannot unclaim this ticket.", ephemeral=True)

        await interaction.channel.edit(topic=make_topic(creator))

        for role_id in (config.INDEX_MIDDLEMAN_ROLE, config.SUPPORT_STAFF_ROLE):
            role = interaction.guild.get_role(role_id)
            if role:
                await interaction.channel.set_permissions(role, send_messages=True)

        await interaction.response.send_message(
            f"{interaction.user.mention} has unclaimed, any active staff can now claim ticket."
        )

    @discord.ui.button(label="Close", style=discord.ButtonStyle.secondary)
    async def close(self, interaction: discord.Interaction, button: discord.ui.Button):
        creator, claimed = read_topic(interaction.channel)

        if (
            interaction.user.id != creator
            and interaction.user.id != (int(claimed) if claimed != "none" else 0)
            and interaction.user.id != config.FORCE_UNCLAIM_USER
        ):
            return await interaction.response.send_message("You cannot close this ticket.", ephemeral=True)

        log_channel = interaction.guild.get_channel(config.LOG_CHANNEL_ID)

        transcript = io.StringIO()
        async for msg in interaction.channel.history(oldest_first=True):
            transcript.write(f"[{msg.created_at}] {msg.author}: {msg.content}\n")

        transcript.seek(0)
        file = discord.File(transcript, filename=f"{interaction.channel.name}.txt")

        if log_channel:
            await log_channel.send(
                content=(
                    f"ticketfile.\n"
                    f"Created by: <@{creator}>\n"
                    f"Claimed by: {f'<@{claimed}>' if claimed != 'none' else 'None'}\n"
                    f"Closed by: {interaction.user.mention}"
                ),
                file=file
            )

        await interaction.channel.delete()

# ---------------- MODALS ----------------

class TradeModal(discord.ui.Modal, title="Trade Ticket"):
    other = discord.ui.TextInput(label="User/ID of the other person")
    desc = discord.ui.TextInput(label="Description", style=discord.TextStyle.paragraph)
    ps = discord.ui.TextInput(label="Can both join ps link?", required=False)

    async def on_submit(self, interaction):
        await create_ticket(interaction, "trade", {
            "Other User": self.other.value,
            "Description": self.desc.value,
            "PS Link": self.ps.value or "N/A"
        })

class IndexModal(discord.ui.Modal, title="Index Ticket"):
    item = discord.ui.TextInput(label="What would you like to index?")
    hold = discord.ui.TextInput(label="What are you letting us hold?")
    obey = discord.ui.TextInput(label="Will you obey the staff commands?")

    async def on_submit(self, interaction):
        await create_ticket(interaction, "index", {
            "Indexing": self.item.value,
            "Holding": self.hold.value,
            "Rules": self.obey.value
        })

class SupportModal(discord.ui.Modal, title="Support Ticket"):
    issue = discord.ui.TextInput(label="What do you need help with?")
    proof = discord.ui.TextInput(label="Do you have any proofs?")
    wait = discord.ui.TextInput(label="Will you wait patiently?")

    async def on_submit(self, interaction):
        await create_ticket(interaction, "support", {
            "Issue": self.issue.value,
            "Proof": self.proof.value,
            "Patience": self.wait.value
        })

class ReportModal(discord.ui.Modal, title="Report Ticket"):
    who = discord.ui.TextInput(label="Who are you reporting?")
    reason = discord.ui.TextInput(label="What did he do?", style=discord.TextStyle.paragraph)
    proof = discord.ui.TextInput(label="Do you have any proofs?")

    async def on_submit(self, interaction):
        await create_ticket(interaction, "report", {
            "Reported User": self.who.value,
            "Reason": self.reason.value,
            "Proof": self.proof.value
        })

# ---------------- VIEWS ----------------

class TradeView(discord.ui.View):
    @discord.ui.button(label="Request", style=discord.ButtonStyle.green)
    async def req(self, interaction, _):
        await interaction.response.send_modal(TradeModal())

class IndexView(discord.ui.View):
    @discord.ui.button(label="Request", style=discord.ButtonStyle.green)
    async def req(self, interaction, _):
        await interaction.response.send_modal(IndexModal())

class SupportSelect(discord.ui.View):
    @discord.ui.button(label="Select Ticket", style=discord.ButtonStyle.blurple)
    async def select(self, interaction, _):
        await interaction.response.send_message(
            "Choose ticket type:",
            view=SupportOptions(),
            ephemeral=True
        )

class SupportOptions(discord.ui.View):
    @discord.ui.button(label="Support", style=discord.ButtonStyle.green)
    async def support(self, interaction, _):
        await interaction.response.send_modal(SupportModal())

    @discord.ui.button(label="Report", style=discord.ButtonStyle.red)
    async def report(self, interaction, _):
        await interaction.response.send_modal(ReportModal())

# ---------------- TICKET CREATION ----------------

async def create_ticket(interaction, ttype, fields):
    guild = interaction.guild
    category = guild.get_channel(config.TICKET_CATEGORY_ID)

    channel = await guild.create_text_channel(
        f"{ttype}-{interaction.user.name}".lower(),
        category=category,
        topic=make_topic(interaction.user.id)
    )

    role_id = config.SUPPORT_STAFF_ROLE if ttype in ("support", "report") else config.INDEX_MIDDLEMAN_ROLE

    embed = discord.Embed(title=f"{ttype.title()} Ticket", color=discord.Color.green())
    for k, v in fields.items():
        embed.add_field(name=k, value=v, inline=False)

    await channel.send(f"<@&{role_id}>", embed=embed, view=TicketControls())
    await interaction.response.send_message("Ticket created.", ephemeral=True)

# ---------------- COMMANDS ----------------

@bot.command()
@owner_only()
async def main(ctx):
    embed = discord.Embed(
        title="Safe Trading Server",
        description=(
            "**Found a trade and would like to ensure a safe trading experience?**\n\n"
            "**What we provide**\n"
            "• Safe traders between 2 parties\n"
            "• Fast and easy deals\n\n"
            "**Important notes**\n"
            "• Both parties must agree\n"
            "• Fake tickets = ban\n"
            "• Follow Discord ToS"
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
            "Open this ticket if you would like indexing service.\n\n"
            "• You must pay first\n"
            "• Be patient\n"
            "• State your Roblox username"
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
            "1. Come with proof otherwise ticket will be closed.\n"
            "2. Staff’s have the last say.\n"
            "3. Do not be rude.\n"
            "Thats it."
        ),
        color=discord.Color.blue()
    )
    await ctx.send(embed=embed, view=SupportSelect())

# ---------------- START ----------------

bot.run(config.TOKEN)
