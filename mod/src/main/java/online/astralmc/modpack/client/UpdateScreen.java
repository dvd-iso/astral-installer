package online.astralmc.modpack.client;

import java.net.URI;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.MultiLineTextWidget;
import net.minecraft.client.gui.components.StringWidget;
import net.minecraft.client.gui.screens.ConfirmLinkScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import online.astralmc.modpack.update.Channel;
import online.astralmc.modpack.update.Updater;

/** Só widgets vanilla: a renderização do 26.x muda a cada versão, os widgets quase não mudam. */
public final class UpdateScreen extends Screen {
    private static final int GOLD = 0xF2C14E;
    private static final int MUTED = 0xA0A0B0;
    private static final URI SITE = URI.create("https://astralmc.online/instalar.html");

    private final Screen parent;
    private final Updater updater;
    private Updater.State shown;
    private StringWidget status;

    public UpdateScreen(Screen parent, Updater updater) {
        super(Component.literal("Atualização do Astral"));
        this.parent = parent;
        this.updater = updater;
    }

    @Override
    protected void init() {
        shown = updater.state();
        Channel channel = updater.channel();
        String next = channel != null ? channel.version() : updater.pendingVersion();
        String body;
        int y = Math.max(16, height / 6);
        centered(new StringWidget(title.copy().withColor(GOLD), font), y);
        y += 20;
        switch (shown) {
            case AVAILABLE -> {
                String notes = channel.releaseNotes().isBlank() ? "" : "\n\n" + channel.releaseNotes();
                body = "Chegou a versão " + next + " do modpack.\nVocê está com a " + updater.installed().version() + "." + notes;
            }
            case REINSTALL -> body = "A versão " + next + " usa Minecraft " + channel.minecraftVersion() + " com Fabric " + channel.fabricLoader()
                + ".\nEssa troca é feita fora do jogo: rode de novo o comando de instalação de astralmc.online."
                + "\nMundos e configurações continuam como estão.";
            case DOWNLOADING -> body = "Baixando a versão " + next + ".\nMods que você já tem são reaproveitados.";
            case READY -> body = "A versão " + next + " está pronta e é instalada quando o jogo fecha."
                + "\nDepois, abra o Minecraft de novo pelo launcher.\n\nAté lá, o servidor Astral pede a versão nova.";
            case FAILED -> body = "Não deu para baixar a atualização.\n" + updater.error() + "\n\nConfira sua internet e tente de novo.";
            default -> {
                minecraft.gui.setScreen(parent);
                return;
            }
        }
        int textWidth = Math.min(320, width - 40);
        MultiLineTextWidget text = new MultiLineTextWidget(Component.literal(body), font).setMaxWidth(textWidth).setMaxRows(14).setCentered(true);
        centered(text, y);
        y += text.getHeight() + 12;
        status = centered(new StringWidget(width - 40, 12, Component.empty(), font), y);
        updateStatus();
        y = Math.min(height - 28, y + 22);
        switch (shown) {
            case AVAILABLE -> buttons(y, "Atualizar agora", this::startDownload, "Agora não", this::onClose);
            case REINSTALL -> buttons(y, "Ver como instalar", () -> ConfirmLinkScreen.confirmLinkNow(this, SITE), "Agora não", this::onClose);
            case DOWNLOADING -> buttons(y, "Cancelar", updater::cancel, null, null);
            case READY -> buttons(y, "Fechar o jogo", minecraft::stop, "Continuar jogando", this::onClose);
            case FAILED -> buttons(y, "Tentar de novo", this::startDownload, "Agora não", this::onClose);
            default -> {}
        }
    }

    @Override
    public void tick() {
        if (updater.state() != shown) rebuildWidgets();
        else updateStatus();
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return updater.state() != Updater.State.DOWNLOADING;
    }

    @Override
    public void onClose() {
        minecraft.gui.setScreen(parent);
    }

    private void startDownload() {
        Thread download = new Thread(updater::download, "astral-modpack-download");
        download.setDaemon(true);
        download.start();
    }

    private void updateStatus() {
        if (status == null) return;
        Component message = shown == Updater.State.DOWNLOADING
            ? Component.literal(updater.phase() + " · " + Math.round(updater.progress() * 100) + "%").withColor(MUTED)
            : Component.empty();
        status.setMessage(message);
        status.setWidth(font.width(message));
        status.setX((width - status.getWidth()) / 2);
    }

    private void buttons(int y, String first, Runnable firstAction, String second, Runnable secondAction) {
        if (second == null) {
            addRenderableWidget(Button.builder(Component.literal(first), button -> firstAction.run()).bounds((width - 150) / 2, y, 150, 20).build());
            return;
        }
        addRenderableWidget(Button.builder(Component.literal(first), button -> firstAction.run()).bounds(width / 2 - 154, y, 150, 20).build());
        addRenderableWidget(Button.builder(Component.literal(second), button -> secondAction.run()).bounds(width / 2 + 4, y, 150, 20).build());
    }

    private <T extends AbstractWidget> T centered(T widget, int y) {
        widget.setX((width - widget.getWidth()) / 2);
        widget.setY(y);
        return addRenderableWidget(widget);
    }
}
