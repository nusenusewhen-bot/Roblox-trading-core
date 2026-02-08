import discord
from modals import MainModal, IndexModal, SupportModal, ReportModal

class MainView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Request", style=discord.ButtonStyle.green)
    async def request(self, interaction, button):
        await interaction.response.send_modal(MainModal())

class IndexView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Request Index", style=discord.ButtonStyle.green)
    async def request(self, interaction, button):
        await interaction.response.send_modal(IndexModal())

class SupportView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Support", style=discord.ButtonStyle.blurple)
    async def support(self, interaction, button):
        await interaction.response.send_modal(SupportModal())

    @discord.ui.button(label="Report", style=discord.ButtonStyle.red)
    async def report(self, interaction, button):
        await interaction.response.send_modal(ReportModal())
