import type { Component } from "svelte";
import type { ArcadeClient } from "$lib/arcade.svelte";
import TriviaPlay from "./TriviaPlay.svelte";
import TriviaHost from "./TriviaHost.svelte";
import HiveMindPlay from "./HiveMindPlay.svelte";
import HiveMindHost from "./HiveMindHost.svelte";
import GrandJuryPlay from "./GrandJuryPlay.svelte";
import GrandJuryHost from "./GrandJuryHost.svelte";
import TelephonePlay from "./TelephonePlay.svelte";
import TelephoneHost from "./TelephoneHost.svelte";
import SplitStealPlay from "./SplitStealPlay.svelte";
import SplitStealHost from "./SplitStealHost.svelte";
import MergerPlay from "./MergerPlay.svelte";
import MergerHost from "./MergerHost.svelte";

export interface GameScreenProps {
  arcade: ArcadeClient;
}

export interface GameScreens {
  play: Component<GameScreenProps>;
  host: Component<GameScreenProps>;
}

export const gameScreens: Record<string, GameScreens> = {
  trivia: { play: TriviaPlay, host: TriviaHost },
  "hive-mind": { play: HiveMindPlay, host: HiveMindHost },
  "grand-jury": { play: GrandJuryPlay, host: GrandJuryHost },
  telephone: { play: TelephonePlay, host: TelephoneHost },
  "split-or-steal": { play: SplitStealPlay, host: SplitStealHost },
  merger: { play: MergerPlay, host: MergerHost },
};
