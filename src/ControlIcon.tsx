const paths = {
  device: 'M7 2h10v20H7z M11 19h2',
  history: 'M3 4v5h5 M3 9a9 9 0 1 1 0 7 M12 7v5l3 2',
  review: 'M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z M12 6v14',
  leave: 'M10 4H4v16h6 M9 12h12m-5-5 5 5-5 5',
  interrupt: 'm12 3 10 17H2z M12 9v5 M12 16v1',
  send: 'm3 11 18-8-7 18-3-7-8-3z M11 14l10-11',
  close: 'm5 5 14 14 M19 5 5 19',
  expand: 'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6',
  collapse: 'M9 3v6H3 M15 3v6h6 M21 15h-6v6 M9 21v-6H3',
  pause: 'M8 5v14 M16 5v14',
  play: 'M7 4l13 8-13 8z',
  mute: 'M3 9h4l5-4v14l-5-4H3z M16 9l6 6m0-6-6 6',
  sound: 'M3 9h4l5-4v14l-5-4H3z M16 8a6 6 0 0 1 0 8 M19 5a10 10 0 0 1 0 14',
  stop: 'M6 6h12v12H6z',
  back: 'M20 12H4m7-7-7 7 7 7',
  next: 'm9 5 7 7-7 7',
};
export function ControlIcon({name}: {name: keyof typeof paths}) {
  return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
