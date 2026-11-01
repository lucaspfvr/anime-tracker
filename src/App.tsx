import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { isEntry, status, toggleEpisode } from './model'
import type { Anime, Entry } from './model'

const KEY = 'anime-tracker:v1'
function load(): { entries: Entry[]; error: string } {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { entries: [], error: '' }
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data) || !data.every(isEntry)) throw new Error()
    return { entries: data, error: '' }
  } catch { return { entries: [], error: 'Não foi possível ler sua lista salva. Os dados anteriores foram preservados. Exporte ou recupere o armazenamento antes de adicionar novos títulos.' } }
}
function Stars({ value }: { value: number }) { return <span className="stars" aria-label={`${value} de 5 estrelas`}><span aria-hidden="true">★★★★★</span><span aria-hidden="true" style={{width: `${value / 5 * 100}%`}}>★★★★★</span></span> }
function Cover({ anime }: { anime: Anime }) { return <div className="cover"><span aria-hidden="true">▶</span>{anime.image && <img src={anime.image} alt={`Capa de ${anime.title}`} loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }} />}</div> }
export default function App() {
  const [initial] = useState(load)
  const [entries, setEntries] = useState(initial.entries)
  const [storageError, setStorageError] = useState(initial.error)
  const [tab, setTab] = useState<'list' | 'search'>('list')
  const [filter, setFilter] = useState('Todos')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Anime[]>([])
  const [busy, setBusy] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [activeQuery, setActiveQuery] = useState('')
  const [selected, setSelected] = useState<Anime | null>(null)
  const [episodePage, setEpisodePage] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { if (selected) dialog.current?.showModal(); else dialog.current?.close() }, [selected])
  function save(next: Entry[]) {
    if (initial.error) { setStorageError(initial.error); return }
    try { localStorage.setItem(KEY, JSON.stringify(next)); setEntries(next); setStorageError('') }
    catch { setStorageError('Não foi possível salvar. O navegador pode estar bloqueando o armazenamento ou sem espaço.') }
  }
  function add(anime: Anime) {
    if (entries.some(e => e.id === anime.id)) return
    save([...entries, {...anime, watched: [], rating: null, completed: false}])
  }
  function update(entry: Entry) { save(entries.map(e => e.id === entry.id ? entry : e)) }
  async function search(term: string, targetPage = 1) {
    if (!term.trim()) return
    controller.current?.abort()
    const request = new AbortController(); controller.current = request
    const timeout = window.setTimeout(() => request.abort(), 15000)
    setBusy(true); setError(''); setSearched(true); setResults([])
    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(term.trim())}&page=${targetPage}&limit=12&sfw=true`, {signal: request.signal})
      if (!response.ok) throw new Error(response.status === 429 ? 'Muitas consultas em pouco tempo. Aguarde alguns segundos e tente novamente.' : 'O catálogo está indisponível. Tente novamente em instantes.')
      const body = await response.json()
      if (!Array.isArray(body.data)) throw new Error('O catálogo retornou uma resposta inesperada.')
      const mapped: Anime[] = body.data.map((item: { mal_id: number; title: string; images?: { webp?: { large_image_url?: string } }; episodes: number | null; synopsis?: string; year: number | null }) => ({id:item.mal_id, title:item.title, image:item.images?.webp?.large_image_url || '', episodes:item.episodes && item.episodes > 0 ? item.episodes : null, synopsis:item.synopsis || 'Sinopse não disponível.', year:item.year ?? null}))
      setResults([...new Map(mapped.map(a => [a.id,a])).values()]); setHasNext(Boolean(body.pagination?.has_next_page)); setPage(targetPage); setActiveQuery(term)
    } catch (err) {
      if (controller.current === request) setError(request.signal.aborted ? 'A consulta demorou demais. Verifique a conexão e tente novamente.' : err instanceof Error ? err.message : 'Falha de conexão.')
    } finally { clearTimeout(timeout); if (controller.current === request) setBusy(false) }
  }
  function submit(event: FormEvent) { event.preventDefault(); void search(query) }
  const current = entries.find(e => e.id === selected?.id)
  const shown = entries.filter(e => filter === 'Todos' || status(e) === filter)
  const totalEpisodes = entries.reduce((sum,e) => sum + e.watched.length, 0)
  const cards: Anime[] = tab === 'list' ? shown : results
  function open(anime: Anime) { setSelected(anime); setEpisodePage(0) }
  return <>
    <header className="topbar"><a className="brand" href="#" onClick={e => {e.preventDefault(); setTab('list')}}><span className="brand-icon">▶</span> anime<span>tracker</span><small>BETA</small></a><span className="local-badge">● Salvo neste navegador</span></header>
    <main>
      <section className="hero"><div><span className="eyebrow">CADA EPISÓDIO CONTA</span><h1>Suas histórias.<br/><em>No seu ritmo.</em></h1><p>Organize o que você assiste e guarde suas próximas descobertas.</p><button className="primary" onClick={() => setTab('search')}>＋ Descobrir animes</button></div><div className="hero-art" aria-hidden="true"><div className="orbit"/><div className="ticket"><span>SUA PRÓXIMA HISTÓRIA</span><b>再生</b><span>APERTE O PLAY ▶</span></div></div></section>
      <section className="stats" aria-label="Estatísticas"><div><b>{entries.length}</b><span>Na sua lista</span></div><div><b>{entries.filter(e=>status(e)==='Assistindo').length}</b><span>Assistindo</span></div><div><b>{entries.filter(e=>e.completed).length}</b><span>Concluídos</span></div><div><b>{totalEpisodes}</b><span>Episódios vistos</span></div></section>
      {storageError && <p className="error" role="alert">{storageError}</p>}
      <nav className="tabs" aria-label="Navegação principal"><button className={tab==='list'?'active':''} onClick={()=>setTab('list')}>Minha lista</button><button className={tab==='search'?'active':''} onClick={()=>setTab('search')}>Explorar catálogo</button></nav>
      {tab === 'list' ? <div className="section-heading"><div><h2>Sua coleção</h2><p>Uma boa história merece ser lembrada.</p></div><label className="filter">Mostrar<select value={filter} onChange={e=>setFilter(e.target.value)}>{['Todos','Assistindo','Quero assistir','Concluídos'].map(f=><option key={f}>{f}</option>)}</select></label></div> : <><div className="section-heading"><div><h2>Encontre sua próxima história</h2><p>Busque pelo nome original ou internacional do anime.</p></div></div><form className="search" onSubmit={submit}><input aria-label="Nome do anime" placeholder="Experimente Naruto, Bleach, Frieren…" value={query} onChange={e=>setQuery(e.target.value)} required maxLength={120}/><button className="primary" disabled={busy || !query.trim()}>{busy ? 'Buscando…' : 'Buscar'}</button></form></>}
      <p className="sr-only" role="status">{notice}</p>
      {error && tab==='search' && <p className="error" role="alert">{error}</p>}
      {busy && tab==='search' ? <div className="empty" role="status">Consultando o catálogo…</div> : cards.length ? <div className="grid">{cards.map(anime=>{ const entry = entries.find(e=>e.id===anime.id); return <article className="card" key={anime.id}><button className="cover-button" onClick={()=>open(anime)} aria-label={`Ver ${anime.title}`}><Cover anime={anime}/><span className="card-tag">{entry ? status(entry) : anime.year || 'ANIME'}</span></button><div className="card-content"><h3><button onClick={()=>open(anime)}>{anime.title}</button></h3><p>{anime.episodes === null ? 'Total de episódios não informado' : `${anime.episodes} episódios`}</p>{entry ? <><div className="progress" role="progressbar" aria-label={`Progresso de ${anime.title}`} aria-valuenow={entry.watched.length} aria-valuemin={0} aria-valuemax={entry.episodes ?? undefined}><span style={{width:entry.episodes ? `${entry.watched.length/entry.episodes*100}%` : '0%'}}/></div><div className="card-bottom"><span>{entry.watched.length} / {entry.episodes ?? '?'} vistos</span>{entry.rating !== null && <span className="rating">★ {entry.rating.toFixed(1)}</span>}</div><button className="secondary full" onClick={()=>open(anime)}>Gerenciar episódios</button></> : <button className="secondary full" onClick={()=>{add(anime);setNotice(`${anime.title} adicionado à lista`)}}>＋ Adicionar à lista</button>}</div></article>})}</div> : !error && <div className="empty"><span className="empty-icon">✦</span><h3>{tab==='list' ? 'Sua próxima história começa aqui' : searched ? 'Nenhum anime encontrado' : 'Qual anime você quer acompanhar?'}</h3><p>{tab==='list' ? 'Busque um anime e adicione à sua coleção.' : 'Tente o título original ou uma palavra diferente.'}</p>{tab==='list' && <button className="secondary" onClick={()=>setTab('search')}>Explorar catálogo →</button>}</div>}
      {tab==='search' && results.length>0 && !busy && <div className="pagination"><button disabled={page===1} onClick={()=>void search(activeQuery,page-1)}>← Anterior</button><span>Página {page}</span><button disabled={!hasNext} onClick={()=>void search(activeQuery,page+1)}>Próxima →</button></div>}
      <footer><span>Anime Tracker · primeira versão</span><span>Catálogo: <a href="https://jikan.moe" target="_blank" rel="noreferrer">Jikan</a> / MyAnimeList · Sinopses podem estar em inglês.</span><p>Seu progresso fica neste navegador. Limpar os dados do site apaga a lista; ainda não há sincronização entre dispositivos.</p></footer>
    </main>
    <dialog ref={dialog} onCancel={()=>setSelected(null)} onClose={()=>setSelected(null)} aria-labelledby="detail-title">
      {selected && <><div className="dialog-top"><span className="eyebrow">SUA HISTÓRIA</span><button aria-label="Fechar detalhes" onClick={()=>setSelected(null)}>✕</button></div><h2 id="detail-title">{selected.title}</h2><p className="synopsis">{selected.synopsis}</p>{!current ? <button className="primary" onClick={()=>add(selected)}>＋ Adicionar à minha lista</button> : <>
        <div className="detail-heading"><h3>Episódios assistidos</h3><b>{current.watched.length} / {current.episodes ?? '?'}</b></div>
        {current.episodes ? <><div className="episode-grid">{Array.from({length:Math.min(50,current.episodes-episodePage*50)},(_,i)=>episodePage*50+i+1).map(n=><button key={n} aria-label={`Episódio ${n}`} aria-pressed={current.watched.includes(n)} className={current.watched.includes(n)?'seen':''} onClick={()=>update(toggleEpisode(current,n))}>{n}</button>)}</div>{current.episodes>50 && <div className="pagination"><button disabled={episodePage===0} onClick={()=>setEpisodePage(p=>p-1)}>← Anteriores</button><span>{episodePage*50+1}–{Math.min((episodePage+1)*50,current.episodes)}</span><button disabled={(episodePage+1)*50>=current.episodes} onClick={()=>setEpisodePage(p=>p+1)}>Próximos →</button></div>}</> : <div className="unknown"><p>O catálogo ainda não informou o total. Registre os episódios em sequência.</p><button disabled={!current.watched.length} onClick={()=>update(toggleEpisode(current, Math.max(...current.watched)))}>− Último episódio</button><button onClick={()=>update(toggleEpisode(current, Math.max(0,...current.watched)+1))}>＋ Próximo episódio</button><label><input type="checkbox" checked={current.completed} onChange={e=>update({...current,completed:e.target.checked})}/> Marcar como concluído</label></div>}
        <section className="review"><h3>{current.completed ? 'Concluído! Qual é sua nota?' : 'Sua avaliação'}</h3><p>{current.completed ? 'Escolha de meia a cinco estrelas.' : 'Conclua o anime para registrar sua nota.'}</p>{current.rating !== null && <Stars value={current.rating}/>}<label>Nota<select aria-label="Sua nota" disabled={!current.completed} value={current.rating ?? ''} onChange={e=>update({...current,rating:e.target.value ? Number(e.target.value) : null})}><option value="">Sem avaliação</option>{Array.from({length:10},(_,i)=>(i+1)/2).map(n=><option key={n} value={n}>{n.toFixed(1).replace('.',',')} {n===1?'estrela':'estrelas'}</option>)}</select></label></section>
        <button className="danger" onClick={()=>{if(window.confirm(`Remover ${current.title} e seu progresso da lista?`)){save(entries.filter(e=>e.id!==current.id));setSelected(null)}}}>Remover da lista</button>
      </>}</>}
    </dialog>
  </>
}
