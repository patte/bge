// Minimal replacement for TAPi18n. Loads the three dictionaries and
// provides __(key, ...args) with sprintf-style %s / %% handling, plus a
// tiny change-notification mechanism (replaces I18NConf.onLanguageChange).
import de from '../i18n/de.json'
import fr from '../i18n/fr.json'
import it from '../i18n/it.json'

const DICTS = { de, fr, it }
export const LANGUAGES = ['de', 'fr', 'it']
const DEFAULT_LANGUAGE = 'de'

let current = DEFAULT_LANGUAGE
const listeners = new Set()

export function getLanguage() {
  return current
}

export function setLanguage(lang) {
  if (!LANGUAGES.includes(lang) || lang === current) return
  current = lang
  try {
    localStorage.setItem('lang', lang)
  } catch (e) {
    /* ignore */
  }
  document.documentElement.setAttribute('lang', lang)
  listeners.forEach((fn) => fn(lang))
}

export function onLanguageChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// sprintf-ish: replace each %s with the next arg, then %% -> %.
export function __(key, ...args) {
  const dict = DICTS[current] || DICTS[DEFAULT_LANGUAGE]
  let str = dict[key]
  if (str == null) str = DICTS[DEFAULT_LANGUAGE][key]
  if (str == null) return key
  for (const a of args) {
    str = str.replace('%s', () => String(a)) // function form avoids $-pattern issues
  }
  return str.replace(/%%/g, '%')
}

export function initLanguage() {
  let saved = null
  try {
    saved = localStorage.getItem('lang')
  } catch (e) {
    /* ignore */
  }
  const nav = (navigator.language || DEFAULT_LANGUAGE).slice(0, 2)
  current = (saved && LANGUAGES.includes(saved) && saved) || (LANGUAGES.includes(nav) ? nav : DEFAULT_LANGUAGE)
  document.documentElement.setAttribute('lang', current)
  return current
}
