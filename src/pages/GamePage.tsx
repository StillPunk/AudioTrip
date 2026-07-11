import { useEffect } from 'react';
import { useUIStore } from '@/shared/model/store';
import { bootstrapGame } from '@/app/bootstrap';
import Vignette from '@/widgets/Vignette';
import TelegramFallback from '@/widgets/TelegramFallback';
import EntryBox from '@/widgets/EntryBox';
import StartScreen from '@/widgets/StartScreen';
import LoadingScreen from '@/widgets/LoadingScreen';
import GameHud from '@/widgets/GameHud';
import PauseMenu from '@/widgets/PauseMenu';
import EndScreen from '@/widgets/EndScreen';
import HistoryScreen from '@/widgets/HistoryScreen';
import LeaderboardScreen from '@/widgets/LeaderboardScreen';
import TutorialScreen from '@/widgets/TutorialScreen';
import ClaimScreen from '@/widgets/ClaimScreen';
import TotalScore from '@/widgets/TotalScore';
import ClaimButton from '@/widgets/ClaimButton';

export default function GamePage() {
  const screen = useUIStore((s) => s.screen);

  useEffect(() => {
    void bootstrapGame();
  }, []);

  return (
    <>
      <Vignette />
      <div id="ui-container">
        {screen === 'telegram-fallback' && <TelegramFallback />}
        {screen === 'entry' && <EntryBox />}
        {screen === 'start' && <StartScreen />}
        <LoadingScreen hidden={screen !== 'loading'} />
        <GameHud />
        <PauseMenu />
        <EndScreen hidden={screen !== 'end'} />
        <HistoryScreen hidden={screen !== 'history'} />
        <LeaderboardScreen hidden={screen !== 'leaderboard'} />
        <ClaimScreen hidden={screen !== 'claim'} />
        <TutorialScreen />
        <TotalScore />
        <ClaimButton />
      </div>
    </>
  );
}
