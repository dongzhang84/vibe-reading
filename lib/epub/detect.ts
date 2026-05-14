import 'server-only'
import type JSZip from 'jszip'

// EPUB containers are ZIP files. ZIP magic bytes are PK\x03\x04
// (also \x05\x06 for empty archives, \x07\x08 for spanned — rare for EPUB
// but we accept them so we can fail with a more specific error later).
export function looksLikeEpub(buf: Buffer): boolean {
  if (buf.length < 4) return false
  return (
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)
  )
}

// EPUB spec: encryption is recorded in META-INF/encryption.xml when DRM
// is applied (Adobe DRM, Apple FairPlay, etc.). OPF can also carry an
// <encryption> child but the META-INF file is the canonical signal.
export function isDrmProtected(zip: JSZip): boolean {
  return zip.file('META-INF/encryption.xml') !== null
}

// After all chapter content is extracted, if total plain text is below
// this threshold the EPUB is almost certainly image-only (scanned manga,
// PDF-to-EPUB autoconvert, etc.). Symmetric with the PDF watermark/scan
// path — same "find a copy with extractable text" UX message.
export const MIN_TEXT_THRESHOLD = 1000
