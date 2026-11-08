import {Show} from './shared/sim.js';
import {SlideMode} from '../slide/ground-motion.mjs';
import {withPartyRules} from '../../../teddy-playground/dist/solo/party.js';
import {applySlideBoost, slideInput, slidePieces} from './slide-handling.js';

export class CityPartyShow extends withPartyRules(Show) {
  startStage(index) {
    super.startStage(index);
    this.chutes = slidePieces(this.stage);
    for (const player of this.players) player.slideMode = new SlideMode();
  }

  prepareRunner(player) {
    player.input = slideInput(player, player.slideMode, this.chutes, this.stage.path);
  }

  perkMods(player, aliveCount) {
    super.perkMods(player, aliveCount);
    applySlideBoost(player, player.slideMode);
  }
}
