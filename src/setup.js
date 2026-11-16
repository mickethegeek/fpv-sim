// Controller setup screen: walks the pilot through moving each stick, then saves the mapping.
import { WIZARD_STEPS, createWizard, wizardUpdate, wizardSkip, mappingValid } from './input.js';

export class SetupScreen {
  constructor(input, root = document.getElementById('setup')) {
    this.input = input;
    this.root = root;
    this.wizard = null;
    this.message = '';
    root.innerHTML = `
      <div class="card">
        <h2>Controller setup</h2>
        <p class="progress"></p>
        <p class="prompt"></p>
        <div class="bars"></div>
        <p class="note"></p>
        <div class="row">
          <button type="button" data-act="skip">Skip this one</button>
          <button type="button" data-act="cancel">Cancel</button>
        </div>
      </div>`;
    this.el = Object.fromEntries(['progress', 'prompt', 'bars', 'note'].map((k) => [k, root.querySelector('.' + k)]));
    this.skipBtn = root.querySelector('[data-act=skip]');
    this.skipBtn.addEventListener('click', () => this.wizard && wizardSkip(this.wizard));
    root.querySelector('[data-act=cancel]').addEventListener('click', () => this.close());
  }

  get open() { return !!this.wizard; }

  start() {
    const pad = this.input.gamepad();
    this.wizard = createWizard(pad ? pad.id : '');
    this.input.paused = true;
    this.root.hidden = false;
    this.message = '';
  }

  close() {
    this.wizard = null;
    this.input.paused = false;
    this.root.hidden = true;
  }

  // Call once per frame.
  update(dt) {
    const w = this.wizard;
    if (!w) return;
    const pad = this.input.gamepad();
    if (!pad) {
      this.el.progress.textContent = '';
      this.el.prompt.textContent = 'No controller found. Plug it in, then press any button on it.';
      this.el.bars.innerHTML = '';
      this.el.note.textContent = 'Browsers only show a controller after you press a button.';
      this.skipBtn.hidden = true;
      return;
    }
    wizardUpdate(w, pad.axes, pad.buttons, dt);
    if (w.done) {
      if (mappingValid(w.mapping)) {
        const saved = this.input.save(w.mapping);
        this.message = saved ? 'Controller saved.' : 'Controller set for this visit (the browser would not save it).';
      }
      this.close();
      return;
    }
    const step = WIZARD_STEPS[w.step];
    this.el.progress.textContent = `Step ${w.step + 1} of ${WIZARD_STEPS.length} · ${pad.id}`;
    this.el.prompt.textContent = w.t < 0.6 ? 'Let go of the sticks…' : step.text;
    this.skipBtn.hidden = !step.optional;
    this.el.note.textContent = step.optional
      ? 'Optional: without it, use Space to arm and M to switch mode.'
      : 'Hold it there until the next step appears.';
    if (this.el.bars.childElementCount !== pad.axes.length) {
      this.el.bars.innerHTML = pad.axes.map((_, i) => `<div class="bar" title="axis ${i}"><i></i></div>`).join('');
    }
    pad.axes.forEach((v, i) => { this.el.bars.children[i].firstChild.style.left = `${50 + 50 * Math.max(-1, Math.min(1, v))}%`; });
  }
}
