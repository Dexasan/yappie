import { getTopicIconName, matchInterestCatalog } from './chat-interest-catalog.js';

const searchKey = (value) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const catalog = matchInterestCatalog.map((label) => ({ label, key: searchKey(label) }));
const catalogByKey = new Map(catalog.map(({ key, label }) => [key, label]));
const svgNamespace = 'http://www.w3.org/2000/svg';

function topicArtwork(label) {
  const icon = getTopicIconName(label);
  if (!icon) {
    const stamp = document.createElement('span');
    stamp.className = 'topic-glyph topic-stamp';
    stamp.setAttribute('aria-hidden', 'true');
    stamp.textContent = Array.from(searchKey(label)).slice(0, 2).join('').toUpperCase() || '?';
    return stamp;
  }
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.classList.add('topic-glyph');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svgNamespace, 'use');
  use.setAttribute('href', `/assets/chat-topic-icons.svg#${icon}`);
  svg.append(use);
  return svg;
}

export function createInterestPicker(container) {
  const search = container.querySelector('#interest-search');
  const input = search.querySelector('#interest');
  const list = search.querySelector('#interest-suggestions');
  const add = search.querySelector('#add-interest');
  const chip = search.querySelector('#selected-interest');
  const feedback = search.querySelector('#interest-feedback');
  const picks = [...container.querySelectorAll('[data-interest]')];
  let selected = '';
  let choices = [];
  let activeIndex = -1;

  const typed = () => input.value.trim().replace(/\s+/g, ' ');

  function closeSuggestions() {
    choices = [];
    activeIndex = -1;
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function setSelection(label) {
    selected = label;
    const selectedKey = searchKey(label);
    let selectedPick = false;
    for (const pick of picks) {
      const matches = searchKey(pick.dataset.interest) === selectedKey;
      pick.setAttribute('aria-pressed', String(matches));
      selectedPick ||= matches;
    }
    chip.hidden = !label || selectedPick;
    if (chip.hidden) chip.replaceChildren();
    else {
      chip.replaceChildren(topicArtwork(label), document.createTextNode(`${label} ×`));
      chip.setAttribute('aria-label', `Remove ${label}`);
    }
    input.value = '';
    add.hidden = true;
    closeSuggestions();
    feedback.textContent = label ? `Interest added: ${label}` : 'Interest removed.';
  }

  function addTyped() {
    const label = typed();
    if (!label) return;
    if (label.length < 2) {
      feedback.textContent = 'Enter at least two characters to add an interest.';
      return;
    }
    setSelection(catalogByKey.get(searchKey(label)) ?? label);
    input.focus();
  }

  function renderSuggestions() {
    closeSuggestions();
    const label = typed();
    const query = searchKey(label);
    add.hidden = label.length < 2;
    if (!label) return;
    const selectedKey = searchKey(selected);
    const matches = query ? catalog.filter(({ key }) => key.includes(query) && key !== selectedKey) : [];
    matches.sort((left, right) => Number(!left.key.startsWith(query)) - Number(!right.key.startsWith(query)));
    choices = matches.slice(0, 6).map((match) => ({ label: match.label, custom: false }));
    if (label.length >= 2 && !catalogByKey.has(query) && label !== selected) choices.push({ label, custom: true });

    for (const [index, choice] of choices.entries()) {
      const row = document.createElement('button');
      row.type = 'button';
      row.id = `interest-option-${index}`;
      row.className = 'suggestion-row';
      row.tabIndex = -1;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      const title = document.createElement('span');
      title.className = 'suggestion-label';
      title.textContent = choice.custom ? `Use “${choice.label}”` : choice.label;
      const action = document.createElement('span');
      action.className = 'suggestion-action';
      action.textContent = 'Add +';
      action.setAttribute('aria-hidden', 'true');
      row.append(topicArtwork(choice.label), title, action);
      row.addEventListener('mousedown', (event) => event.preventDefault());
      row.addEventListener('click', () => {
        setSelection(choice.label);
        input.focus();
      });
      list.append(row);
    }
    list.hidden = !choices.length;
    input.setAttribute('aria-expanded', String(choices.length > 0));
  }

  function highlight(index) {
    list.children[activeIndex]?.setAttribute('aria-selected', 'false');
    activeIndex = index;
    const option = list.children[index];
    option.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
  }

  for (const pick of picks) {
    pick.addEventListener('click', () => setSelection(pick.getAttribute('aria-pressed') === 'true' ? '' : pick.dataset.interest));
  }
  chip.addEventListener('click', () => { setSelection(''); input.focus(); });
  add.addEventListener('click', addTyped);
  input.addEventListener('focus', renderSuggestions);
  input.addEventListener('input', () => {
    feedback.textContent = '';
    renderSuggestions();
  });
  input.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.repeat) return;
      if (activeIndex < 0) addTyped();
      else setSelection(choices[activeIndex].label);
    } else if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      closeSuggestions();
    } else if (event.key === 'Tab') closeSuggestions();
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.hidden) renderSuggestions();
      if (!choices.length) return;
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? Math.min(activeIndex + 1, choices.length - 1)
        : activeIndex < 0 ? choices.length - 1 : Math.max(0, activeIndex - 1);
      highlight(next);
    }
  });
  document.addEventListener('click', (event) => {
    if (!search.contains(event.target)) closeSuggestions();
  });

  return { get value() { return selected; } };
}
