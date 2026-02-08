import discord
from discord.ext import commands
import config
from views import MainView, IndexView, SupportView

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.members = True

bot = commands.Bot(command_prefix="$", intents=intents)

def owner_only():
    async def predicate(ctx):
        return ctx.author.id == config.COMMAND_OWNER
    return commands.check(predicate)

@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")

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
    await ctx.send(embed=embed, view=MainView())

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
            "1. Come with proof\n"
            "2. Staff has last say\n"
            "3. Do not be rude"
        ),
        color=discord.Color.blue()
    )
    await ctx.send(embed=embed, view=SupportView())

bot.run(config.TOKEN)
