import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icons';
import type { Tone } from './status';

/** Bottom sheet for details and forms. Closes on backdrop tap or Escape. */
export function Sheet(props: {
  title: string;
  onClose: () => void;
  icon?: IconName;
  tone?: Tone;
  children: ReactNode;
}) {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Rendered at the top of the page: inside an animated parent (e.g. the crash plan)
  // a sheet would be trapped in that parent's layer, under the tab bar.
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          {props.icon && (
            <span className={`disc disc--sm tone-${props.tone ?? 'unknown'}`}>
              <Icon name={props.icon} size={18} />
            </span>
          )}
          <h2>{props.title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}
