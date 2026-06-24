// noUiSlider wrapper reproducing Template.slider's behaviour: (re)created when
// the question changes, starting at the answer's importance, disabled when the
// answer's consent is 0 (a "dead" one-sided answer), and emitting importance
// changes back into the engine while dimming the content during the drag.
import $ from 'jquery'
import noUiSlider from 'nouislider'
import { engine } from './engine.js'

export function createSlider(question, answer) {
  const el = document.getElementById('nouislider')
  if (!el) return
  if (el.noUiSlider) el.noUiSlider.destroy()

  let start = 0.5
  if (answer && answer.importance != null) start = answer.importance

  noUiSlider.create(el, {
    start: [start],
    range: { min: 0, max: 1 },
    connect: false,
    behaviour: 'tap-drag',
    animate: false,
  })

  el.noUiSlider.on('start', () => {
    $('#content, #bubbles-container').addClass('dim')
  })
  el.noUiSlider.on('slide', (values) => {
    engine.setImportance(parseFloat(values[0]), question)
  })
  el.noUiSlider.on('end', () => {
    $('#content, #bubbles-container').removeClass('dim')
  })

  if (answer && answer.consent === 0) {
    el.setAttribute('disabled', true)
  } else {
    el.removeAttribute('disabled')
  }
}

export function destroySlider() {
  const el = document.getElementById('nouislider')
  if (el && el.noUiSlider) el.noUiSlider.destroy()
}
