export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  const query = String(req.query.q || '').trim()
  if (!query) return res.status(400).json({ message: '검색어를 입력해 주세요.' })

  const response = await fetch(`https://openapi.naver.com/v1/search/local.json?display=5&query=${encodeURIComponent(query)}`, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
    },
  })

  if (!response.ok) return res.status(response.status).json({ message: '네이버 장소 검색에 실패했습니다.' })

  const data = await response.json()
  const items = data.items.map((item, index) => ({
    id: `${item.mapx}-${item.mapy}-${index}`,
    title: item.title.replace(/<[^>]*>/g, ''),
    address: item.address,
    roadAddress: item.roadAddress,
    mapx: item.mapx,
    mapy: item.mapy,
  }))
  return res.status(200).json({ items })
}
