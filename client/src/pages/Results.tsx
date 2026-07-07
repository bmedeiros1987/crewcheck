import Home from './Home';

export default function Results() {
  try {
    sessionStorage.setItem('crewcheck_initial_view', 'roster');
    sessionStorage.setItem('crewcheck_force_view_once', 'roster');
  } catch {}
  return <Home />;
}
