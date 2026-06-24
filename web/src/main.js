// Bootstrap for the static smartervote build.
import $ from 'jquery'
import 'nouislider/dist/nouislider.css'
import './styles/main.less'
import { initLanguage } from './lib/i18n.js'
import { engine } from './smartervote/engine.js'
import { initUI } from './smartervote/ui.js'
import { getSharedFromUrl } from './lib/store.js'

// a few legacy code paths poke at the global jQuery
window.$ = window.jQuery = $

function boot() {
  initLanguage()
  initUI()
  const shared = getSharedFromUrl()
  engine.start({ sharedAnswers: shared })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
