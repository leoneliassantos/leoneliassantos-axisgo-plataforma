/* ================================================================== *
 *  Leitor de planilhas resiliente (browser).
 *  Tenta o SheetJS normal (.xlsx e .xls bem-formados). Se o resultado
 *  vier vazio — caso dos .xls exportados por alguns sistemas contábeis
 *  BR, que gravam o ponteiro do substream (lbPlyPos) ERRADO e fazem o
 *  SheetJS abrir a planilha vazia —, cai para um leitor BIFF8 próprio
 *  que ignora o ponteiro e lê os registros direto do stream "Workbook".
 *
 *  Recebe o módulo XLSX já carregado (import dinâmico no componente) para
 *  não quebrar o code-splitting do bundle.
 * ================================================================== */

type XLSXModule = typeof import('xlsx')
type AOA = unknown[][]

export function readFirstSheetAOA(XLSX: XLSXModule, data: ArrayBuffer): AOA {
  const bytes = new Uint8Array(data)
  // 1) caminho normal
  try {
    const wb = XLSX.read(bytes, { type: 'array', cellDates: false, raw: true })
    const name = wb.SheetNames[0]
    const ws = name ? wb.Sheets[name] : undefined
    if (ws && ws['!ref']) {
      return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
    }
  } catch {
    /* cai para o BIFF */
  }
  // 2) fallback BIFF8 (via CFB do próprio SheetJS)
  return biffFirstSheetAOA(XLSX, bytes)
}

/* --------------------------- BIFF8 mínimo --------------------------- */
function rkToNum(rk: number): number {
  let val: number
  if (rk & 0x02) {
    val = rk >> 2
  } else {
    const buf = new ArrayBuffer(8)
    const dv = new DataView(buf)
    dv.setInt32(4, rk & 0xfffffffc, true)
    val = dv.getFloat64(0, true)
  }
  return rk & 0x01 ? val / 100 : val
}

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8)
}

/** Lê a Shared String Table (0x00FC) com seus CONTINUE (0x003C). */
function parseSST(segs: Uint8Array[]): string[] {
  const strings: string[] = []
  if (!segs.length) return strings
  let si = 0
  let off = 8 // pula cstTotal(4) + cstUnique(4) no 1º segmento
  const cstUnique = u16(segs[0], 4) | (u16(segs[0], 6) << 16)
  const segByte = (): number => {
    while (si < segs.length && off >= segs[si].length) {
      si++
      off = 0
    }
    return segs[si][off++]
  }
  for (let n = 0; n < cstUnique; n++) {
    while (si < segs.length && off >= segs[si].length) {
      si++
      off = 0
    }
    if (si >= segs.length) break
    const cch = u16(segs[si], off)
    off += 2
    let grbit = segByte()
    let fHigh = grbit & 0x01
    const fExt = grbit & 0x04
    const fRich = grbit & 0x08
    let cRun = 0
    let cbExt = 0
    if (fRich) cRun = segByte() | (segByte() << 8)
    if (fExt) cbExt = segByte() | (segByte() << 8) | (segByte() << 16) | (segByte() << 24)
    let s = ''
    let i = 0
    while (i < cch) {
      if (off >= segs[si].length) {
        si++
        off = 0
        fHigh = segByte() & 0x01
      }
      let code: number
      if (fHigh) {
        code = segs[si][off] | (segs[si][off + 1] << 8)
        off += 2
      } else {
        code = segs[si][off]
        off += 1
      }
      s += String.fromCharCode(code)
      i++
    }
    // pula rich runs (cRun*4) e phonetic (cbExt)
    let skip = cRun * 4 + cbExt
    while (skip > 0) {
      if (off >= segs[si].length) {
        si++
        off = 0
      }
      const take = Math.min(skip, segs[si].length - off)
      off += take
      skip -= take
    }
    strings.push(s)
  }
  return strings
}

function biffFirstSheetAOA(XLSX: XLSXModule, bytes: Uint8Array): AOA {
  // CFB do SheetJS abre o container OLE2 e entrega o stream "Workbook".
  // (o SheetJS expõe XLSX.CFB; usamos só read/find.)
  const CFB = (XLSX as unknown as { CFB?: { read: (d: Uint8Array, o: { type: string }) => unknown; find: (c: unknown, p: string) => { content: Uint8Array } | undefined } }).CFB
  if (!CFB) return []
  const cfb = CFB.read(bytes, { type: 'buffer' })
  const entry = CFB.find(cfb, 'Workbook') || CFB.find(cfb, 'Book')
  if (!entry) return []
  const b = entry.content instanceof Uint8Array ? entry.content : new Uint8Array(entry.content as ArrayBuffer)
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)

  // 1ª passada: coletar SST + achar o BOF da 1ª worksheet (dt = 0x0010)
  let p = 0
  const sstSegs: Uint8Array[] = []
  let inSST = false
  let wsBOF = -1
  while (p + 4 <= b.length) {
    const t = u16(b, p)
    const len = u16(b, p + 2)
    if (t === 0x00fc) {
      inSST = true
      sstSegs.push(b.subarray(p + 4, p + 4 + len))
    } else if (t === 0x003c && inSST) {
      sstSegs.push(b.subarray(p + 4, p + 4 + len))
    } else {
      inSST = false
    }
    if (t === 0x0809 && u16(b, p + 6) === 0x0010 && wsBOF < 0) wsBOF = p
    p += 4 + len
  }
  const SST = parseSST(sstSegs)
  if (wsBOF < 0) return []

  // 2ª passada: células da worksheet
  const cells: Record<string, unknown> = {}
  let maxR = 0
  let maxC = 0
  const put = (r: number, c: number, v: unknown) => {
    cells[r + ',' + c] = v
    if (r > maxR) maxR = r
    if (c > maxC) maxC = c
  }
  p = wsBOF
  let first = true
  while (p + 4 <= b.length) {
    const t = u16(b, p)
    const len = u16(b, p + 2)
    const d = p + 4
    if (t === 0x000a && !first) break // EOF da worksheet
    first = false
    switch (t) {
      case 0x00fd: {
        // LABELSST
        put(u16(b, d), u16(b, d + 2), SST[dv.getInt32(d + 6, true) >>> 0])
        break
      }
      case 0x0204: {
        // LABEL (string inline)
        const r = u16(b, d)
        const c = u16(b, d + 2)
        const cch = u16(b, d + 6)
        const gr = b[d + 8]
        let s = ''
        if (gr & 1) for (let k = 0; k < cch; k++) s += String.fromCharCode(u16(b, d + 9 + k * 2))
        else for (let k = 0; k < cch; k++) s += String.fromCharCode(b[d + 9 + k])
        put(r, c, s)
        break
      }
      case 0x0203: // NUMBER
        put(u16(b, d), u16(b, d + 2), dv.getFloat64(d + 6, true))
        break
      case 0x027e: // RK
        put(u16(b, d), u16(b, d + 2), rkToNum(dv.getInt32(d + 6, true)))
        break
      case 0x00bd: {
        // MULRK
        const r = u16(b, d)
        const cFirst = u16(b, d + 2)
        const nn = (len - 6) / 6
        for (let k = 0; k < nn; k++) put(r, cFirst + k, rkToNum(dv.getInt32(d + 4 + k * 6 + 2, true)))
        break
      }
      case 0x0006: {
        // FORMULA — usa o resultado numérico (ignora resultado string)
        const isText = b[d + 6] === 0 && b[d + 12] === 0xff && b[d + 13] === 0xff
        if (!isText) put(u16(b, d), u16(b, d + 2), dv.getFloat64(d + 6, true))
        break
      }
    }
    p += 4 + len
  }

  const aoa: AOA = []
  for (let r = 0; r <= maxR; r++) {
    const row: unknown[] = []
    for (let c = 0; c <= maxC; c++) {
      const v = cells[r + ',' + c]
      row.push(v === undefined ? '' : v)
    }
    aoa.push(row)
  }
  return aoa
}
