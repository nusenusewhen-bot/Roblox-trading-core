import discord
from discord.ext import commands
import config
from views import MainView, IndexView, SupportView

intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.guilds = True

bot = commands.Bot(command_prefix="$", intents=intents)


# ---------- HELPERS ----------

def owner_only():
    async def predicate(ctx):
        return ctx.author.id == config.COMMAND_OWNER
    return commands.check(predicate)


def is_ticket_channel(channel):
    return channel.category and channel.category.id == config.TICKET_CATEGORY_ID


def get_ticket_data(channel):
    if not channel.topic:
        return None, "none"
    try:
        creator, claimed = channel.topic.split("|")
        return int(creator.strip()), claimed.strip()
    except:
        return None, "none"


def is_staff(member):
    return any(
        r.id in (
            config.INDEX_MIDDLEMAN_ROLE,
            config.SUPPORT_STAFF_ROLE,
        )
        for r in member.roles
    )


# ---------- EVENTS ----------

@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")


# ---------- MAIN COMMANDS ----------

@bot.command()
@owner_only()
async def main(ctx):
    embed = discord.Embed(
        title="Safe Trading Server",
        description=(
            "**Found a trade and want a safe experience?**\n\n"
            "• Verified middlemen\n"
            "• Fast & secure\n"
            "• Fake tickets = ban"
        ),
        color=discord.Color.blue()
    )
    embed.set_image(url="https://i.ibb.co/JF73d5JF/ezgif-4b693c75629087.gif")
    await ctx.send(embed=embed, view=MainView())


@bot.command()
@owner_only()
async def index(ctx):
    embed = discord.Embed(
        title="Indexing Service",
        description="Open a ticket for indexing services.",
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
            "2. Staff has last say\n"
            "3. Do not be rude"
        ),
        color=discord.Color.blue()
    )
    await ctx.send(embed=embed, view=SupportView())


# ---------- TICKET COMMANDS ----------

@bot.command()
async def add(ctx, member: discord.Member):
    if not is_ticket_channel(ctx.channel):
        return

    creator_id, _ = get_ticket_data(ctx.channel)

    if ctx.author.id != creator_id and not is_staff(ctx.author):
        return await ctx.send("❌ You can't add users to this ticket.")

    await ctx.channel.set_permissions(member, view_channel=True, send_messages=True)
    await ctx.send(f"✅ {member.mention} added to the ticket.")


@bot.command()
async def claim(ctx):
    if not is_ticket_channel(ctx.channel):
        return

    if not is_staff(ctx.author):
        return await ctx.send("❌ You cannot claim tickets.")

    creator_id, claimed = get_ticket_data(ctx.channel)
    if claimed != "none":
        return await ctx.send("❌ Ticket already claimed.")

    await ctx.channel.edit(topic=f"{creator_id} | {ctx.author.id}")

    for role_id in (config.INDEX_MIDDLEMAN_ROLE, config.SUPPORT_STAFF_ROLE):
        role = ctx.guild.get_role(role_id)
        if role:
            await ctx.channel.set_permissions(role, send_messages=False)

    await ctx.channel.set_permissions(ctx.author, send_messages=True)
    await ctx.send(f"🟢 {ctx.author.mention} has claimed ticket.")


@bot.command()
async def unclaim(ctx):
    if not is_ticket_channel(ctx.channel):
        return

    creator_id, claimed = get_ticket_data(ctx.channel)

    if claimed == "none":
        return await ctx.send("❌ Ticket is not claimed.")

    if ctx.author.id != int(claimed) and ctx.author.id != config.FORCE_UNCLAIM_USER:
        return await ctx.send("❌ You cannot unclaim this ticket.")

    await ctx.channel.edit(topic=f"{creator_id} | none")

    for role_id in (config.INDEX_MIDDLEMAN_ROLE, config.SUPPORT_STAFF_ROLE):
        role = ctx.guild.get_role(role_id)
        if role:
            await ctx.channel.set_permissions(role, send_messages=True)

    await ctx.send("🔓 Ticket unclaimed. Any active staff can now claim.")


@bot.command()
async def transfer(ctx, member: discord.Member):
    if not is_ticket_channel(ctx.channel):
        return

    creator_id, claimed = get_ticket_data(ctx.channel)

    if ctx.author.id != int(claimed) and ctx.author.id != config.FORCE_UNCLAIM_USER:
        return await ctx.send("❌ You cannot transfer this ticket.")

    if not is_staff(member):
        return await ctx.send("❌ User is not a valid middleman.")

    await ctx.channel.edit(topic=f"{creator_id} | {member.id}")
    await ctx.send(f"🔁 Ticket transferred to {member.mention}.")


@bot.command()
async def close(ctx):
    if not is_ticket_channel(ctx.channel):
        return

    creator_id, claimed = get_ticket_data(ctx.channel)

    if (
        ctx.author.id != creator_id
        and ctx.author.id != (int(claimed) if claimed != "none" else 0)
        and ctx.author.id != config.FORCE_UNCLAIM_USER
    ):
        return await ctx.send("❌ You cannot close this ticket.")

    log_channel = ctx.guild.get_channel(config.LOG_CHANNEL_ID)

    embed = discord.Embed(title="ticketfile.", color=discord.Color.red())
    embed.add_field(name="Created by", value=f"<@{creator_id}>", inline=False)
    embed.add_field(
        name="Claimed by",
        value=f"<@{claimed}>" if claimed != "none" else "None",
        inline=False
    )
    embed.add_field(name="Closed by", value=ctx.author.mention, inline=False)

    if log_channel:
        await log_channel.send(embed=embed)

    await ctx.channel.delete()


# ---------- START ----------

bot.run(config.TOKEN)
