import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import type { Tone } from './status';

/**
 * The page's status line. Calm states are plain large text on the page;
 * only something that needs action becomes a solid panel you can tap.
 */
export function StatusHead(props: {
  tone: Tone;
  icon: IconName;
  title: string;
  line: string;
  foot?: ReactNode;
  action?: string;
  onClick?: () => void;
}) {
  const loud = props.tone === 'alert' || props.tone === 'warn';
  const body = (
    <>
      <span className="status__title">
        <span className="status__mark"><Icon name={props.icon} size={loud ? 22 : 20} /></span>
        {props.title}
      </span>
      <span className="status__line">{props.line}</span>
      {loud && (props.foot || props.action) && (
        <span className="status__foot">
          <span>{props.foot}</span>
          {props.action && <span className="status__action">{props.action} <Icon name="chevron" size={14} /></span>}
        </span>
      )}
    </>
  );
  if (loud && props.onClick) {
    return (
      <button className={`status status--loud tone-${props.tone}`} onClick={props.onClick} aria-live="polite">
        {body}
      </button>
    );
  }
  return (
    <div className={`status ${loud ? 'status--loud' : ''} tone-${props.tone}`} aria-live="polite">
      {body}
    </div>
  );
}
