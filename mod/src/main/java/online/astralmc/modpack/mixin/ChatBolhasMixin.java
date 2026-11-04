package online.astralmc.modpack.mixin;

import net.minecraft.client.Options;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.options.ChatOptionsScreen;
import net.minecraft.client.gui.screens.options.OptionsSubScreen;
import net.minecraft.network.chat.Component;
import online.astralmc.modpack.bolhas.BolhasTela;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Opções › Chat ganha o botão das bolhas de chat do Astral, no fim da lista de opções. */
@Mixin(ChatOptionsScreen.class)
public abstract class ChatBolhasMixin extends OptionsSubScreen {
    protected ChatBolhasMixin(Screen anterior, Options opcoes, Component titulo) { super(anterior, opcoes, titulo); }

    @Inject(method = "addOptions", at = @At("TAIL"), require = 0)
    private void astral$botaoBolhas(CallbackInfo ci) {
        try {
            list.addHeader(Component.literal("Astral"));
            list.addBig(Button.builder(Component.literal("Bolhas de chat…"), botao -> minecraft.gui.setScreen(new BolhasTela(this))).build());
        } catch (RuntimeException ex) {
            // Se a lista mudar numa versão futura do jogo, o botão some; o chat segue funcionando.
        }
    }
}
