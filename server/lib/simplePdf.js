// PDF из одной картинки (JPEG) на одной странице — без внешних библиотек. Билет в письме уходит именно таким файлом.
// Размер страницы задаётся в пунктах (1 пт = 1/72 дюйма); картинка растягивается на всю страницу.

/** Строка PDF в UTF-16BE (так хранятся заголовок и автор с русскими буквами). */
const pdfText = (s) => `<FEFF${Buffer.from(s, 'utf16le').swap16().toString('hex').toUpperCase()}>`

/**
 * jpeg — Buffer с JPEG (RGB), widthPx/heightPx — размеры картинки, pageWidthPt — ширина страницы в пунктах
 * (высота считается по пропорциям картинки). info — { title, author }.
 */
export function jpegToPdf(jpeg, widthPx, heightPx, { pageWidthPt = 720, title = '', author = '' } = {}) {
  const w = pageWidthPt
  const h = Math.round((pageWidthPt * heightPx) / widthPx)
  const content = Buffer.from(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`, 'latin1')
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`, 'latin1'),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, 'latin1'),
      jpeg,
      Buffer.from('\nendstream', 'latin1'),
    ]),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream', 'latin1')]),
    Buffer.from(`<< /Title ${pdfText(title)} /Author ${pdfText(author)} /Producer ${pdfText(author)} >>`, 'latin1'),
  ]
  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')]
  const offsets = []
  let pos = parts[0].length
  objects.forEach((body, i) => {
    offsets.push(pos)
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')])
    parts.push(chunk)
    pos += chunk.length
  })
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('')
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'))
  return Buffer.concat(parts)
}
