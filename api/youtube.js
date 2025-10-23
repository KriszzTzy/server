// api/youtube.js
import fetch from 'node-fetch'
import { Buffer } from 'buffer'

class Youtubers {
  constructor() {
    this.hex = "C5D58EF67A7584E4A29F6C35BBC4EB12";
  }

  async uint8(hex) {
    const pecahan = hex.match(/[\dA-F]{2}/gi);
    if (!pecahan) throw new Error("Format tidak valid");
    return new Uint8Array(pecahan.map(h => parseInt(h, 16)));
  }

  b64Byte(b64) {
    const bersih = b64.replace(/\s/g, "");
    const biner = Buffer.from(bersih, 'base64');
    return new Uint8Array(biner);
  }

  async key() {
    const raw = await this.uint8(this.hex);
    return await crypto.subtle.importKey("raw", raw, { name: "AES-CBC" }, false, ["decrypt"]);
  }

  async Data(base64Terenkripsi) {
    const byteData = this.b64Byte(base64Terenkripsi);
    if (byteData.length < 16) throw new Error("Data terlalu pendek");

    const iv = byteData.slice(0, 16);
    const data = byteData.slice(16);

    const kunci = await this.key();
    const hasil = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      kunci,
      data
    );

    const teks = new TextDecoder().decode(new Uint8Array(hasil));
    return JSON.parse(teks);
  }

  async getCDN() {
    let retries = 5
    while (retries--) {
      try {
        const res = await fetch("https://media.savetube.me/api/random-cdn")
        const data = await res.json()
        if (data?.cdn) return data.cdn
      } catch {}
    }
    throw new Error("Gagal ambil CDN setelah 5 percobaan")
  }

  async infoVideo(linkYoutube) {
    const cdn = await this.getCDN();
    const res = await fetch(`https://${cdn}/v2/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: linkYoutube }),
    });

    const hasil = await res.json();
    if (!hasil.status) throw new Error(hasil.message || "Gagal ambil data video");

    const isi = await this.Data(hasil.data);
    return {
      judul: isi.title,
      durasi: isi.durationLabel,
      thumbnail: isi.thumbnail,
      kode: isi.key
    };
  }

  async getDownloadLink(kodeVideo, kualitas) {
    let retries = 5
    while (retries--) {
      try {
        const cdn = await this.getCDN()
        const res = await fetch(`https://${cdn}/download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            downloadType: 'audio',
            quality: kualitas,
            key: kodeVideo,
          }),
        })

        const json = await res.json()
        if (json?.status && json?.data?.downloadUrl) {
          return json.data.downloadUrl
        }
      } catch {}
    }
    throw new Error("Gagal ambil link unduh setelah 5 percobaan")
  }

  async downloadAudio(linkYoutube, kualitas = '128') {
    try {
      const data = await this.infoVideo(linkYoutube);
      const linkUnduh = await this.getDownloadLink(data.kode, kualitas);
      return {
        status: true,
        judul: data.judul,
        durasi: data.durasi,
        url: linkUnduh,
      };
    } catch (err) {
      return {
        status: false,
        pesan: err.message
      };
    }
  }
}

export default async function handler(req, res) {
  const url = (req.method === 'GET' ? req.query.url : req.body?.url) || ''
  const kualitas = (req.query.quality || req.body?.quality || '128').replace(/[^0-9]/g, '')

  if (!url) return res.status(400).json({ error: 'Missing url parameter. Usage: /api/youtube?url=<youtube_url>' })

  try {
    const yt = new Youtubers()
    const result = await yt.downloadAudio(url, kualitas)

    if (!result.status) throw new Error(result.pesan)
    res.json({
      ok: true,
      title: result.judul,
      duration: result.durasi,
      quality: kualitas,
      audio: result.url
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}