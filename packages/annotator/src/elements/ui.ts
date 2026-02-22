import { css } from 'lit';

/** Styles shared by the toolbar, the panel and the label picker. */
export const uiStyles = css`
  button {
    font: inherit;
    color: inherit;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--tessera-space-1);
    min-width: 32px;
    height: 32px;
    padding: 0 var(--tessera-space-2);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--tessera-radius-md);
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    background: var(--tessera-color-surface-2);
  }
  .btn[aria-pressed='true'] {
    background: var(--tessera-color-primary);
    color: var(--tessera-color-primary-contrast);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .btn.danger {
    color: var(--tessera-color-danger);
  }
  .btn.solid {
    background: var(--tessera-color-surface-2);
    border-color: var(--tessera-color-border);
  }
  .dot {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: var(--tessera-radius-full);
    background: var(--_c);
    box-shadow: 0 0 0 1px var(--tessera-color-bg), 0 0 0 2px var(--tessera-color-border);
  }
  input[type='text'],
  select,
  textarea {
    width: 100%;
    min-height: 32px;
    font: inherit;
    color: var(--tessera-color-text);
    background: var(--tessera-color-bg);
    border: 1px solid var(--tessera-color-border);
    border-radius: var(--tessera-radius-md);
    padding: 0 var(--tessera-space-2);
  }
  textarea {
    padding: var(--tessera-space-1) var(--tessera-space-2);
    resize: vertical;
  }
  label {
    display: grid;
    gap: 2px;
    font-size: var(--tessera-font-size-sm);
    font-weight: 600;
  }
`;
