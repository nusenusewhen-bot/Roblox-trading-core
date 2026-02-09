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
    return any(
        r.id in (
            config.INDEX_MIDDLEMAN_ROLE,
            config.SUPPORT_STAFF_ROLE,
        )
        for r in member.roles
    )


def ticket_topic(creator_id, claimed="none"):
    return f"{creator_id} | {claimed}"


def parse_topic(channel):
    if not channel.topic:
        return None, "none"
    c, cl = channel.topic.split("|")
    return int(c.strip()), cl.strip()


async def send_ticket_controls(channel):
    view = TicketControls()
    await channel.send("Ticket controls:", view=view)


# ---------------- TICKET CONTROLS ----------------

class TicketControls(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Claim", style=discord.ButtonStyle.success)
    async def claim(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_staff(interaction.user):
            return await interaction.response.send_message("No permission.", ephemeral=True)

        creator, claimed = parse_topic(interaction.channel)
        if claimed != "none":
            return await interaction.response.send_message("Already claimed.", ephemeral=True)

        await interaction.channel.edit(topic=ticket_topic(creator, interaction.user.id))

        for role_id in (config.INDEX_MIDDLEMAN_ROLE, config.SUPPORT_STAFF_ROLE):
            role = interaction.guild.get_role(role_id)
            if role:
                await interaction.channel.set_permissions(role, send_messages=False)

        await interaction.channel.set_permissions(interaction.user, send_messages=True)
        await interaction.response.send_message(
            f"🟢 {interaction.user.mention} has claimed ticket."
        )

    @discord.ui.button(label="Unclaim", style=discord.ButtonStyle.danger)
    async def unclaim(self, interaction: discord.Interaction, button: discord.ui.Button):
        creator, claimed = parse_topic(interaction.channel)

        if claimed == "none":
            return await interaction.response.send_message("Not claimed.", ephemeral=True)

        if interaction.user.id != int(claimed) and interaction.user.id != config.FORCE_UNCLAIM_USER:
            return await interaction.response.send_message("No permission.", ephemeral=True)

        await interaction.channel.edit(topic=ticket_topic(creator))

        for role_id in (config.INDEX_MIDDLEMAN_ROLE, config.SUPPORT_STAFF_ROLE):
            role = interaction.guild.get_role(role_id)
            if role:
                await interaction.channel.set_permissions(role, send_messages=True)

        await interaction.response.send_message(
            f"🔓 {interaction.user.mention} unclaimed the ticket. Any staff may claim."
        )

    @discord.ui.button(label="Close", style=discord.ButtonStyle.secondary)
    async def close(self, interaction: discord.Interaction, button: discord.ui.Button):
        creator, claimed = parse_topic(interaction.channel)

        if (
            interaction.user.id != creator
            and interaction.user.id != (int(claimed) if claimed != "none" else 0)
            and interaction.user.id != config.FORCE_UNCLAIM_USER
        ):
            return await interaction.response.send_message("No permission.", ephemeral=True)

        log_channel = interaction.guild.get_channel(config.LOG_CHANNEL_ID)

        transcript = io.StringIO()
        async for msg in interaction.channel.history(oldest_first=True):
            transcript.write(f"[{msg.created_at}] {msg.author}: {msg.content}\n")

        transcript.seek(0)
        file = discord.File(transcript, filename=f"{interaction.channel.name}.txt")

        if log_channel:
            await log_channel.send(
                content=(
                    f"**Ticket Closed**\n"
                    f"Created by: <@{creator}>\n"
                    f"Claimed by: {f'<@{claimed}>' if claimed != 'none' else 'None'}\n"
                    f"Closed by: {interaction.user.mention}"
                ),
                file=file
            )

        await interaction.channel.delete()


# ---------------- SUPPORT SELECT ----------------

class SupportSelect(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.select(
        placeholder="Choose ticket type",
        options=[
            discord.SelectOption(label="Support", value="support"),
            discord.SelectOption(label="Report", value="report"),
        ]
    )
    async def select(self, interaction: discord.Interaction, select: discord.ui.Select):
        await create_ticket(interaction, select.values[0])


# ---------------- TICKET CREATION ----------------

async def create_ticket(interaction, ttype):
    guild = interaction.guild
    category = guild.get_channel(config.TICKET_CATEGORY_ID)

    name = f"{ttype}-{interaction.user.name}".lower()

    overwrites = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        interaction.user: discord.PermissionOverwrite(view_channel=True, send_messages=True),
    }

    channel = await guild.create_text_channel(
        name,
        category=category,
        overwrites=overwrites,
        topic=ticket_topic(interaction.user.id)
    )

    role_id = (
        config.SUPPORT_STAFF_ROLE
        if ttype in ("support", "report")
        else config.INDEX_MIDDLEMAN_ROLE
    )

    await channel.send(f"<@&{role_id}>")
    await send_ticket_controls(channel)

    await interaction.response.send_message("Ticket created.", ephemeral=True)


# ---------------- COMMANDS ----------------

@bot.command()
@owner_only()
async def support(ctx):
    embed = discord.Embed(
        title="Support / Report",
        description=(
            "Hello welcome to support/report.\n\n"
            "1. Come with proof\n"
            "2. Staff has the last say\n"
            "3. Do not be rude"
        ),
        color=discord.Color.blue()
    )
    await ctx.send(embed=embed, view=SupportSelect())


@bot.command()
@owner_only()
async def index(ctx):
    await ctx.send("Click to create index ticket.", view=SupportSelect())


@bot.command()
@owner_only()
async def main(ctx):
    await ctx.send("Click to create trade ticket.", view=SupportSelect())


# ---------------- START ----------------

bot.run(config.TOKEN)
