// Vercel Serverless function (Node.js) // Accepts GET or POST with url parameter.

const axios = require('axios') const cheerio = require('cheerio') const FormData = require('form-data')

async function tiktokV1(query) { const encodedParams = new URLSearchParams() encodedParams.set('url', query) encodedParams.set('hd', '1')

const { data } = await axios.post('https://tikwm.com/api/', encodedParams.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Cookie: 'current_language=en', 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36' }, timeout: 15000 })

return data }

async function tiktokV2(query) { const form = new FormData() form.append('q', query)

const { data } = await axios.post('https://savetik.co/api/ajaxSearch', form, { headers: { ...form.getHeaders(), 'Accept': '/', 'Origin': 'https://savetik.co', 'Referer': 'https://savetik.co/en2', 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36', 'X-Requested-With': 'XMLHttpRequest' }, timeout: 15000 })

const rawHtml = data.data const $ = cheerio.load(rawHtml) const title = $('.thumbnail .content h3').text().trim() const thumbnail = $('.thumbnail .image-tik img').attr('src') const video_url = $('video#vid').attr('data-src') || $('video#vid').attr('src')

const slide_images = [] $('.photo-list .download-box li').each((_, el) => { const imgSrc = $(el).find('.download-items__thumb img').attr('src') if (imgSrc) slide_images.push(imgSrc) })

return { title, thumbnail, video_url, slide_images } }

module.exports = async (req, res) => { const url = (req.method === 'GET' ? req.query.url : req.body?.url) || '' if (!url) return res.status(400).json({ error: 'Missing url parameter. Usage: /api/tiktok?url=<tiktok_url>' })

try { let resData = null let images = []

// try method 1
try {
  const dataV1 = await tiktokV1(url)
  if (dataV1?.data) {
    const d = dataV1.data
    if (Array.isArray(d.images) && d.images.length > 0) images = d.images
    else if (Array.isArray(d.image_post) && d.image_post.length > 0) images = d.image_post

    resData = {
      title: d.title,
      cover: d.cover,
      play: d.play,
      hdplay: d.hdplay,
      wmplay: d.wmplay,
      author: d.author,
      stats: {
        play_count: d.play_count,
        digg_count: d.digg_count,
        comment_count: d.comment_count,
        share_count: d.share_count
      },
      raw: d
    }
  }
} catch (e) {
  // ignore v1 errors, continue to v2
}

// try method 2 if needed
try {
  const dataV2 = await tiktokV2(url)
  if ((!resData?.play && images.length === 0) && dataV2.video_url) {
    resData = resData || {}
    resData.play = dataV2.video_url
  }
  if (Array.isArray(dataV2.slide_images) && dataV2.slide_images.length > 0) images = dataV2.slide_images
  if (!resData?.title && dataV2.title) resData = { ...(resData||{}), title: dataV2.title, thumbnail: dataV2.thumbnail }
} catch (e) {
  // ignore
}

if (!resData && images.length === 0) return res.status(404).json({ error: 'Tidak dapat menemukan video atau gambar dari URL tersebut.' })

// choose best video url
const videoUrl = (resData && (resData.play || resData.hdplay || resData.wmplay)) || null

return res.json({ ok: true, title: resData.title || null, thumbnail: resData.thumbnail || resData.cover || null, video: videoUrl, images })

} catch (err) { console.error(err) return res.status(500).json({ error: 'Internal server error', detail: err.message }) } }