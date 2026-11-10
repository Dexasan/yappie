const input = document.querySelector('input[name="link"]');
const submit = document.querySelector('form button');
const link = new URLSearchParams(location.hash.slice(1)).get('link');
// Fragments stay out of HTTP requests; scrub the link from this history entry.
history.replaceState(null, '', location.pathname);
if (link && link.length <= 2000) {
  input.value = link;
  submit.disabled = false;
  document.querySelector('#link-status').hidden = true;
}
