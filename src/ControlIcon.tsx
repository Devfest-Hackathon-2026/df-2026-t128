const paths = {
  expand: 'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6',
  collapse: 'M9 3v6H3 M15 3v6h6 M21 15h-6v6 M9 21v-6H3',
  pause: 'M8 5v14 M16 5v14',
  play: 'M7 4l13 8-13 8z',
  mute: 'M3 9h4l5-4v14l-5-4H3z M16 9l6 6m0-6-6 6',
  book: 'M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1z M12 6v14',
  leave: 'M10 4H4v16h6 M9 12h12m-5-5 5 5-5 5',
  sound: 'M3 9h4l5-4v14l-5-4H3z M16 8a6 6 0 0 1 0 8 M19 5a10 10 0 0 1 0 14',
  stop: 'M6 6h12v12H6z',
  send: 'm3 10 18-7-7 18-3-8-8-3z M11 13 21 3',
  next: 'm9 5 7 7-7 7',
};
export function ControlIcon({name}: {name: keyof typeof paths}) {
  return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
