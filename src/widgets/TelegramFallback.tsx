export default function TelegramFallback() {
  return (
    <div id="tg-fallback">
      <h1>AudioTrip</h1>
      <p>Эта игра предназначена для запуска только внутри Telegram.</p>
      <a href="https://t.me/AudioTripBot" className="tg-link">
        Запустить через Telegram
      </a>
    </div>
  );
}
