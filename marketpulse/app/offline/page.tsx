export default function OfflinePage() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6 text-center">
      <div className="card p-8 max-w-sm">
        <h1 className="text-xl font-semibold mb-2">Você está offline</h1>
        <p className="text-text-2 text-sm">O MarketPulse precisa de conexão para buscar cotações, calendário e análises. As notificações continuam chegando quando a rede voltar.</p>
      </div>
    </main>
  );
}
