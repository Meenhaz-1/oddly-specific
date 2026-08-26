import './Menu.css';

const LINKS = ["Today's two", 'Saved questions', 'How we source', 'Sign in'];

export default function Menu() {
  return (
    <div className="menu">
      {LINKS.map((label) => (
        <a key={label} href="#" className="menu__link">
          {label}
        </a>
      ))}
    </div>
  );
}
