import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'

const days = ['17', '18', '19', '20']
const times = Array.from({ length: 14 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`)
const dayColors = { '17': '#ff877d', '18': '#f6bc58', '19': '#90cfa2', '20': '#7fb7ff' }
const samples = [
  { id: 'sample-1', title: '공항 도착', address: '인천국제공항', day: '16', time: '10:00', color: '#ff877d' },
  { id: 'sample-2', title: '점심 식사', address: '명동', day: '16', time: '13:00', color: '#f6bc58' },
  { id: 'sample-3', title: '한강 산책', address: '여의도 한강공원', day: '17', time: '18:00', color: '#7fb7ff' }
]

function loadStored() {
  try { return JSON.parse(localStorage.getItem('trip-plan-items')) || samples } catch { return samples }
}

export default function App() {
  const [items, setItems] = useState(loadStored)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [day, setDay] = useState('17')
  const [time, setTime] = useState('10:00')
  const [mapReady, setMapReady] = useState(false)
  const [message, setMessage] = useState('')
  const [draggedItem, setDraggedItem] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const savedMarkersRef = useRef([])

  useEffect(() => { localStorage.setItem('trip-plan-items', JSON.stringify(items)) }, [items])

  useEffect(() => {
    if (!contextMenu) return
    const closeMenu = () => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [contextMenu])

  useEffect(() => {
    if (!supabase) return
    supabase.from('plan_items').select('*').order('created_at').then(({ data, error }) => {
      if (!error && data?.length) setItems(data)
    })
    const channel = supabase.channel('trip-plan')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_items' }, payload => {
        if (payload.eventType === 'INSERT') setItems(current => current.some(x => x.id === payload.new.id) ? current : [...current, payload.new])
        if (payload.eventType === 'UPDATE') setItems(current => current.map(x => x.id === payload.new.id ? payload.new : x))
        if (payload.eventType === 'DELETE') setItems(current => current.filter(x => x.id !== payload.old.id))
      }).subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID
    if (!clientId || window.naver) { setMapReady(Boolean(window.naver)); return }
    const script = document.createElement('script')
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`
    script.onload = () => setMapReady(true)
    document.head.appendChild(script)
    return () => script.remove()
  }, [])

  useEffect(() => {
    if (!mapReady || !window.naver || !document.getElementById('map')) return
    if (!mapRef.current) {
      mapRef.current = new window.naver.maps.Map('map', { center: new window.naver.maps.LatLng(33.3846, 126.5535), zoom: 10 })
    }
    savedMarkersRef.current.forEach(marker => marker.setMap(null))
    savedMarkersRef.current = items.filter(item => item.mapx && item.mapy).map(item => {
      const position = new window.naver.maps.LatLng(Number(item.mapy) / 10000000, Number(item.mapx) / 10000000)
      return new window.naver.maps.Marker({
        map: mapRef.current,
        position,
        title: item.title,
        icon: {
          content: `<span style="display:block;width:18px;height:18px;border:3px solid white;border-radius:50%;background:${dayColors[item.day] || item.color};box-shadow:0 1px 5px rgba(0,0,0,.3)"></span>`,
          anchor: new window.naver.maps.Point(9, 9),
        },
      })
    })
    if (selected?.mapx && selected?.mapy) {
      const position = new window.naver.maps.LatLng(Number(selected.mapy) / 10000000, Number(selected.mapx) / 10000000)
      mapRef.current.setCenter(position); mapRef.current.setZoom(15)
      markerRef.current?.setMap(null)
      markerRef.current = new window.naver.maps.Marker({ map: mapRef.current, position })
    }
  }, [mapReady, selected, items])

  const planned = useMemo(() => new Set(items.map(x => `${x.day}-${x.time}`)), [items])

  async function search(event) {
    event.preventDefault()
    if (!query.trim()) return
    try {
      const response = await fetch(`/api/place-search?q=${encodeURIComponent(query)}`)
      if (!response.ok) throw new Error('search failed')
      const data = await response.json()
      setResults(data.items || [])
    } catch {
      setResults([])
      setMessage('장소 검색을 사용할 수 없습니다. Vercel 배포 환경과 네이버 API 설정을 확인해 주세요.')
    }
  }

  async function addItem() {
    if (!selected) return setMessage('먼저 장소를 선택해 주세요.')
    const item = { id: crypto.randomUUID(), title: selected.title, address: selected.roadAddress || selected.address || '', mapx: selected.mapx, mapy: selected.mapy, day, time, color: dayColors[day] }
    setItems(current => [...current, item])
    setSelected(null); setResults([]); setQuery(''); setMessage(`${day}일 ${time} 일정에 추가했습니다.`)
    if (supabase) {
      const { error } = await supabase.from('plan_items').insert({ ...item })
      if (error) setMessage('로컬에는 추가됐지만 실시간 저장에 실패했습니다. Supabase 설정을 확인해 주세요.')
    }
  }

  async function removeItem(item) {
    setItems(current => current.filter(x => x.id !== item.id))
    setContextMenu(null)
    if (supabase && !String(item.id).startsWith('sample-')) await supabase.from('plan_items').delete().eq('id', item.id)
  }

  async function moveItem(targetDay, targetTime) {
    if (!draggedItem || (draggedItem.day === targetDay && draggedItem.time === targetTime)) return
    const moved = { ...draggedItem, day: targetDay, time: targetTime }
    setItems(current => current.map(item => item.id === moved.id ? moved : item))
    setMessage(`${targetDay}일 ${targetTime}로 일정을 옮겼습니다.`)
    setDraggedItem(null)
    if (supabase && !String(moved.id).startsWith('sample-')) {
      const { error } = await supabase.from('plan_items').update({ day: targetDay, time: targetTime }).eq('id', moved.id)
      if (error) setMessage('화면에서는 이동했지만 실시간 저장에 실패했습니다. Supabase 설정을 확인해 주세요.')
    }
  }

  return <main>
    <section className="planner">
      <div className="planner-top"><div><p className="eyebrow">Jeju TRIP · 11 PEOPLE</p><h1>🍊</h1></div><span className={supabase ? 'live' : 'local'}>{supabase ? '● 실시간 공유 중' : '● 기기 내 임시 저장'}</span></div>
      <div className="calendar"><div className="corner">TIME</div>{days.map((d, i) => <div className="day-head" key={d}><b>{d}</b><span>{['금','토','일','월'][i]}</span></div>)}
        {times.map(t => <div className="time-row" key={t}><div className="time">{t}</div>{days.map(d => <div className={`slot ${planned.has(`${d}-${t}`) ? 'occupied' : ''} ${draggedItem ? 'drop-target' : ''}`} key={d} onDragOver={event => event.preventDefault()} onDrop={() => moveItem(d, t)}>
          {items.filter(x => x.day === d && x.time === t).map(item => <article className="event" draggable style={{ '--event-color': dayColors[item.day] || item.color }} key={item.id} onDragStart={() => setDraggedItem(item)} onDragEnd={() => setDraggedItem(null)} onContextMenu={event => { event.preventDefault(); setContextMenu({ item, x: event.clientX, y: event.clientY }) }}><div><strong>{item.title}</strong><small>{item.address}</small></div><button onClick={() => removeItem(item)} aria-label={`${item.title} 삭제`}>×</button></article>)}
        </div>)}</div>)}</div>
    </section>
    <aside className="side">
      <div className="search-panel"><p className="eyebrow">PLACE FINDER</p><h2>어디로 갈까요?</h2><form onSubmit={search}><input value={query} onChange={e => setQuery(e.target.value)} placeholder="장소 또는 지역 검색" /><button>검색</button></form>
        <div className="results">{results.map(place => <button className={`place ${selected?.id === place.id ? 'selected' : ''}`} key={place.id} onClick={() => setSelected(place)}><b>{place.title}</b><span>{place.roadAddress || place.address}</span></button>)}</div>
      </div>
      <div id="map" className="map">{!mapReady && <div className="map-fallback"><span>MAP</span><p>네이버 지도 Client ID를 연결하면<br />여기에 지도가 표시됩니다.</p></div>}</div>
      <div className="add-panel"><div className="selection">{selected ? <><b>{selected.title}</b><span>{selected.roadAddress || selected.address}</span></> : '장소를 선택해 주세요.'}</div><div className="date-time"><select value={day} onChange={e => setDay(e.target.value)}>{days.map(d => <option value={d} key={d}>{d}일</option>)}</select><select value={time} onChange={e => setTime(e.target.value)}>{times.map(t => <option key={t}>{t}</option>)}</select><button className="add" onClick={addItem}>일정에 추가</button></div>{message && <p className="message">{message}</p>}</div>
    </aside>
    {contextMenu && <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}><button onClick={() => removeItem(contextMenu.item)}>일정 삭제</button></div>}
  </main>
}
