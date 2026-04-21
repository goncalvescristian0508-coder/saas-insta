"use client";

import { DownloadCloud, ShieldAlert } from "lucide-react";

export default function DownloaderPage() {
  return (
    <div>
      <h1 className="page-title">Downloader de Conta</h1>
      <p className="page-subtitle">Baixe vídeos de perfis do Instagram removendo os metadados</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>Nova Extração</h2>
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="input-group">
                <label className="input-label">URL do Perfil do Instagram (@usuario)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="https://instagram.com/brucewayne" 
                />
              </div>

              <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="strip_metadata" defaultChecked style={{ accentColor: 'var(--accent-color)' }} />
                <label htmlFor="strip_metadata" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Limpar metadados via FFmpeg (Remover EXIF, datas, etc.)
                </label>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>
                <DownloadCloud size={18} /> Iniciar Extração
              </button>
            </form>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem', backgroundColor: 'rgba(234, 179, 8, 0.1)', borderColor: 'rgba(234, 179, 8, 0.3)' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <ShieldAlert color="#eab308" />
              <div>
                <h4 style={{ color: '#eab308', marginBottom: '0.5rem' }}>Aviso de Limites</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Extrair muitos vídeos rapidamente de contas públicas pode resultar em bloqueio de IP. O sistema fará pausas automáticas entre os downloads para mitigar este risco.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="glass-panel" style={{ padding: '2rem', height: '100%' }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>Status da Extração</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', borderLeft: '3px solid var(--accent-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 500 }}>@wayneenterprises</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>45%</span>
                </div>
                <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--bg-color)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '45%', height: '100%', backgroundColor: 'var(--accent-color)' }}></div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Processando metadados... (12/26 vídeos)</p>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
