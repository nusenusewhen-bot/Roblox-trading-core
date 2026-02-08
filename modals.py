import discord
import config

async def create_ticket(interaction, title, fields, staff_role):
    guild = interaction.guild
    category = guild.get_channel(config.TICKET_CATEGORY_ID)

    overwrites = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        interaction.user: discord.PermissionOverwrite(view_channel=True, send_messages=True)
    }

    channel = await guild.create_text_channel(
        f"trade-{interaction.user.name}",
        category=category,
        overwrites=overwrites
    )

    embed = discord.Embed(title=title, color=discord.Color.green())
    for name, value in fields.items():
        embed.add_field(name=name, value=value, inline=False)

    await channel.send(
        content=f"<@&{staff_role}>",
        embed=embed
    )

    await interaction.response.send_message(
        "Ticket created!",
        ephemeral=True
    )

class MainModal(discord.ui.Modal, title="Trade Ticket"):
    user = discord.ui.TextInput(label="User/ID of the other person")
    description = discord.ui.TextInput(label="Description", style=discord.TextStyle.paragraph)
    ps = discord.ui.TextInput(label="Can both join ps link?", required=False)

    async def on_submit(self, interaction):
        await create_ticket(
            interaction,
            "Trade Ticket",
            {
                "Other User": self.user.value,
                "Description": self.description.value,
                "PS Link": self.ps.value or "N/A"
            },
            config.INDEX_MIDDLEMAN_ROLE
        )

class IndexModal(discord.ui.Modal, title="Index Ticket"):
    item = discord.ui.TextInput(label="What would you like to index?")
    hold = discord.ui.TextInput(label="What are you letting us hold?")
    obey = discord.ui.TextInput(label="Will you obey staff commands?")

    async def on_submit(self, interaction):
        await create_ticket(
            interaction,
            "Index Ticket",
            {
                "Index Item": self.item.value,
                "Holding": self.hold.value,
                "Obey Rules": self.obey.value
            },
            config.INDEX_MIDDLEMAN_ROLE
        )

class SupportModal(discord.ui.Modal, title="Support Ticket"):
    help = discord.ui.TextInput(label="What do you need help with?")
    proof = discord.ui.TextInput(label="Do you have proofs?")
    wait = discord.ui.TextInput(label="Will you wait patiently?")

    async def on_submit(self, interaction):
        await create_ticket(
            interaction,
            "Support Ticket",
            {
                "Issue": self.help.value,
                "Proof": self.proof.value,
                "Patient": self.wait.value
            },
            config.SUPPORT_STAFF_ROLE
        )

class ReportModal(discord.ui.Modal, title="Report Ticket"):
    who = discord.ui.TextInput(label="Who are you reporting?")
    reason = discord.ui.TextInput(label="What did he do?", style=discord.TextStyle.paragraph)
    proof = discord.ui.TextInput(label="Do you have proofs?")

    async def on_submit(self, interaction):
        await create_ticket(
            interaction,
            "Report Ticket",
            {
                "Reported User": self.who.value,
                "Reason": self.reason.value,
                "Proof": self.proof.value
            },
            config.SUPPORT_STAFF_ROLE
        )
