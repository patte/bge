// Persistence + sharing for the static build.
//
// Originally answers were stored per "visit" in MongoDB and sharing used a
// /myBubbles/:visitId server route. With no backend we:
//   - persist answers to localStorage (the per-browser "visit")
//   - encode the full answer set into the URL hash for sharing (#s=...)
//
// We only persist the minimal fields needed to reconstruct state on load
// (radius is viewport-dependent and recomputed, position is derived from
// status), matching what the original init code did.

const LS_KEY = 'bge.smartervote.answers.v1'

function pickPersistable(a) {
  return {
    questionId: a.questionId || (a.question && a.question._id),
    consent: a.consent == null ? null : a.consent,
    importance: a.importance == null ? null : a.importance,
    value: a.value == null ? null : a.value,
    status: a.status,
    isFavorite: !!a.isFavorite,
  }
}

// Turn the in-memory _answers map (questionId -> answer) into a stored array.
// Only 'valid'/'dead' answers are stored — exactly what the original saved to
// MongoDB (updateAnswer skipped persistence when status was 'skipped', and
// 'new' answers were never touched). Persisting 'skipped' would leak a moved
// importance slider value across reloads/shares.
function serialize(answersById) {
  const out = []
  for (const id of Object.keys(answersById)) {
    const a = answersById[id]
    if (!a || (a.status !== 'valid' && a.status !== 'dead')) continue
    out.push(pickPersistable(a))
  }
  return out
}

export function persistAnswers(answersById) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, answers: serialize(answersById) }))
  } catch (e) {
    /* storage unavailable / full — ignore */
  }
}

export function loadStoredAnswers() {
  const map = new Map()
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return map
    const obj = JSON.parse(raw)
    for (const a of obj.answers || []) {
      if (a.status === 'valid' || a.status === 'dead') map.set(a.questionId, a)
    }
  } catch (e) {
    /* ignore */
  }
  return map
}

export function clearStoredAnswers() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch (e) {
    /* ignore */
  }
}

// ---- sharing via URL hash --------------------------------------------------

function base64UrlEncode(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  return decodeURIComponent(escape(atob(b64)))
}

export function encodeShare(answersById) {
  const arr = serialize(answersById)
  return base64UrlEncode(JSON.stringify(arr))
}

export function decodeShare(token) {
  try {
    const arr = JSON.parse(base64UrlDecode(token))
    const map = new Map()
    for (const a of arr) {
      if (a.status === 'valid' || a.status === 'dead') map.set(a.questionId, a)
    }
    return map
  } catch (e) {
    return null
  }
}

// Returns the shared answers map if the URL carries one, else null.
export function getSharedFromUrl() {
  const m = (window.location.hash || '').match(/[#&]s=([^&]+)/)
  if (!m) return null
  return decodeShare(m[1])
}

export function buildShareUrl(answersById) {
  const base = window.location.origin + window.location.pathname + window.location.search
  return base + '#s=' + encodeShare(answersById)
}
