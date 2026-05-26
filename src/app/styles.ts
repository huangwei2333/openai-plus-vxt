export const PANEL_STYLES = `
:host {
  all: initial;
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.opx-shell {
  position: fixed;
  top: 72px;
  right: 0;
  z-index: 2147483647;
  display: flex;
  align-items: flex-start;
  max-height: calc(100vh - 88px);
}

.opx-shell-sidepanel {
  position: static;
  top: auto;
  right: auto;
  z-index: auto;
  display: block;
  width: 100%;
  height: 100vh;
  min-height: 0;
  max-height: 100vh;
  overflow: hidden;
}

.opx-panel {
  box-sizing: border-box;
  width: min(320px, calc(100vw - 42px));
  max-height: calc(100vh - 88px);
  margin-right: 18px;
  padding: 10px;
  border: 1px solid rgba(54, 211, 153, 0.28);
  border-radius: 8px;
  background: #0b1220;
  color: #e5f7ef;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: rgba(47, 209, 124, 0.55) rgba(15, 23, 42, 0.72);
  scrollbar-width: thin;
}

.opx-shell-sidepanel .opx-panel {
  width: 100%;
  height: 100vh;
  min-height: 0;
  max-height: 100vh;
  margin-right: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  overflow-y: auto;
}

.opx-shell-sidepanel .opx-collapse-toggle {
  display: none;
}

.opx-panel::-webkit-scrollbar {
  width: 8px;
}

.opx-panel::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.72);
  border-radius: 999px;
}

.opx-panel::-webkit-scrollbar-thumb {
  background: rgba(47, 209, 124, 0.55);
  border-radius: 999px;
}

.opx-collapse-toggle {
  box-sizing: border-box;
  width: 32px;
  min-height: 64px;
  margin: 8px 0 0 0;
  padding: 8px 6px;
  border: 1px solid rgba(47, 209, 124, 0.36);
  border-right: 0;
  border-radius: 8px 0 0 8px;
  background: #0b1220;
  color: #93e4bd;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 14px;
  writing-mode: vertical-rl;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
}

.opx-shell.is-collapsed .opx-panel {
  display: none;
}

.opx-shell.is-collapsed .opx-collapse-toggle {
  margin-right: 0;
  border-radius: 8px 0 0 8px;
  background: #102019;
}

.opx-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 6px;
  align-items: stretch;
  margin-bottom: 8px;
}

.opx-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  margin-bottom: 0;
  padding: 3px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.8);
}

.opx-tab {
  height: 30px;
  min-width: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opx-tab.is-active {
  background: #2fd17c;
  color: #04130a;
}

.opx-icon-button {
  box-sizing: border-box;
  width: 34px;
  height: 36px;
  border: 1px solid rgba(47, 209, 124, 0.36);
  border-radius: 8px;
  background: #111827;
  color: #93e4bd;
  cursor: pointer;
  font: inherit;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
}

.opx-icon-button:hover {
  border-color: rgba(47, 209, 124, 0.74);
  color: #bbf7d0;
}

.opx-state {
  margin: 0 0 8px;
  color: #93e4bd;
  font-size: 12px;
  line-height: 16px;
}

.opx-version-notice {
  display: grid;
  gap: 7px;
  margin: 0 0 8px;
  padding: 8px;
  border: 1px solid rgba(47, 209, 124, 0.42);
  border-radius: 7px;
  background: rgba(47, 209, 124, 0.1);
  color: #dcfce7;
}

.opx-version-notice[hidden] {
  display: none;
}

.opx-version-notice-title {
  color: #bbf7d0;
  font-size: 12px;
  font-weight: 800;
  line-height: 16px;
}

.opx-version-notice-body {
  color: #cbd5e1;
  font-size: 11px;
  line-height: 15px;
  overflow-wrap: anywhere;
}

.opx-version-notice-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 54px;
  gap: 5px;
}

.opx-mini-button {
  box-sizing: border-box;
  min-width: 0;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: #2fd17c;
  color: #04130a;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 750;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opx-mini-button-secondary {
  border: 1px solid rgba(47, 209, 124, 0.34);
  background: rgba(15, 23, 42, 0.72);
  color: #93e4bd;
}

.opx-mini-button-danger {
  border: 1px solid rgba(248, 113, 113, 0.46);
  background: rgba(127, 29, 29, 0.24);
  color: #fca5a5;
}

.opx-view {
  display: block;
}

.opx-view[hidden] {
  display: none;
}

.opx-flow-section {
  display: grid;
  gap: 7px;
  margin: 0 0 10px;
  padding: 8px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.42);
}

.opx-flow-section-title {
  color: #bbf7d0;
  font-size: 12px;
  font-weight: 800;
  line-height: 16px;
}

.opx-flow-section-content {
  min-width: 0;
}

.opx-empty-view {
  min-height: 84px;
  display: grid;
  place-items: center;
  border: 1px dashed rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  color: #94a3b8;
  font-size: 13px;
}

.opx-input,
.opx-select,
.opx-textarea {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  margin: 0 0 8px;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 6px;
  background: #111827;
  color: #e5f7ef;
  font: inherit;
  font-size: 13px;
  outline: none;
}

.opx-select {
  appearance: none;
}

.opx-textarea {
  min-height: 72px;
  max-height: 140px;
  padding: 9px 10px;
  resize: vertical;
  line-height: 18px;
}

.opx-input:focus,
.opx-select:focus,
.opx-textarea:focus {
  border-color: #2fd17c;
}

.opx-hint {
  margin: -2px 0 8px;
  color: #94a3b8;
  font-size: 11px;
  line-height: 15px;
}

.opx-hint.is-ok {
  color: #86efac;
}

.opx-summary {
  margin: 0 0 8px;
  padding: 7px 8px;
  border: 1px solid rgba(47, 209, 124, 0.28);
  border-radius: 6px;
  background: rgba(47, 209, 124, 0.08);
  color: #bbf7d0;
  font-size: 11px;
  line-height: 15px;
  word-break: break-word;
  white-space: pre-line;
}

.opx-session-card {
  display: grid;
  gap: 5px;
  margin: 0 0 8px;
  padding: 8px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.72);
}

.opx-session-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 6px;
  color: #94a3b8;
  font-size: 11px;
  line-height: 15px;
}

.opx-session-row strong {
  min-width: 0;
  color: #e5f7ef;
  font-weight: 600;
  word-break: break-word;
}

.opx-session-action-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 104px;
  gap: 6px;
  align-items: start;
}

.opx-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}

.opx-team-options[hidden] {
  display: none;
}

.opx-field {
  display: block;
  min-width: 0;
}

.opx-label {
  display: block;
  margin: 0 0 4px;
  color: #94a3b8;
  font-size: 11px;
  line-height: 14px;
}

.opx-token-textarea {
  min-height: 92px;
}

.opx-output {
  min-height: 58px;
  resize: vertical;
}

.opx-button-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.opx-address-actions {
  grid-template-columns: minmax(0, 1fr);
}

.opx-address-country-grid {
  grid-template-columns: minmax(0, 1fr);
}

.opx-address-random-city {
  margin-bottom: 0;
}

.opx-account-actions {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.opx-account-select-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  color: #cbd5e1;
  font-size: 12px;
  user-select: none;
}

.opx-button {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  margin: 0 0 10px;
  border: 0;
  border-radius: 6px;
  background: #2fd17c;
  color: #04130a;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.opx-button-secondary {
  background: #182235;
  color: #93e4bd;
  border: 1px solid rgba(47, 209, 124, 0.36);
}

.opx-button-danger {
  background: #ef4444;
  color: #fff7ed;
}

.opx-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.opx-register-email-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px 58px;
  gap: 6px;
  align-items: stretch;
}

.opx-register-email-input-row .opx-input,
.opx-register-email-input-row .opx-button {
  margin-bottom: 8px;
}

.opx-email-list-summary {
  width: 100%;
  margin: 0 0 8px;
  padding: 8px 9px;
  border: 1px solid rgba(47, 209, 124, 0.28);
  border-radius: 6px;
  background: rgba(20, 83, 45, 0.2);
  color: #dcfce7;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  line-height: 16px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opx-email-list {
  display: grid;
  gap: 6px;
  margin: 0 0 8px;
}

.opx-email-item {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.62);
  overflow: hidden;
}

.opx-email-item-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 42px 46px;
  gap: 6px;
  align-items: center;
  min-height: 34px;
  padding: 6px 7px;
}

.opx-email-toggle {
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: #e5f7ef;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opx-email-count {
  color: #94a3b8;
  font-size: 11px;
  line-height: 14px;
  text-align: right;
}

.opx-email-delete {
  height: 24px;
  width: 100%;
}

.opx-email-aliases {
  display: grid;
  gap: 6px;
  padding: 0 8px 8px 35px;
}

.opx-email-alias-group {
  display: grid;
  gap: 2px;
  color: #94a3b8;
  font-size: 11px;
  line-height: 15px;
}

.opx-email-alias-group strong {
  color: #bbf7d0;
  font-weight: 700;
}

.opx-email-alias-group span {
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.opx-status {
  min-height: 18px;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 18px;
  word-break: break-word;
}

.opx-status[data-type="ok"] {
  color: #86efac;
}

.opx-status[data-type="error"] {
  color: #fca5a5;
}

.opx-workflow-progress {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: min(100%, 220px);
  min-height: 22px;
  margin: 0;
  padding: 2px 8px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
}

.opx-workflow-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
}

.opx-workflow-header .opx-button {
  width: auto;
  min-width: 76px;
  min-height: 28px;
  margin-left: auto;
  padding: 0 12px;
  white-space: nowrap;
}

.opx-workflow-email-copy {
  max-width: 176px;
  height: 22px;
  overflow: hidden;
  border: 0;
  border-left: 1px solid rgba(148, 163, 184, 0.28);
  padding: 0 0 0 7px;
  background: transparent;
  color: #c4b5fd;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opx-workflow-email-copy:hover,
.opx-workflow-email-copy.is-copied {
  color: #ddd6fe;
}

.opx-workflow-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.opx-workflow-actions .opx-button {
  margin-bottom: 8px;
}

.opx-workflow-tiny-button {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.72);
  color: #cbd5e1;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
}

.opx-workflow-tiny-button {
  width: 40px;
  height: 24px;
  padding: 0;
}

.opx-workflow-tiny-button:hover {
  border-color: rgba(47, 209, 124, 0.48);
  color: #dcfce7;
}

.opx-workflow-tiny-button:disabled {
  cursor: not-allowed;
  opacity: 0.46;
}

.opx-workflow-session-field {
  margin-bottom: 4px;
}

.opx-workflow-session-input {
  height: 54px;
  min-height: 54px;
  max-height: 54px;
  resize: none;
}

.opx-workflow-account-input {
  height: 54px;
  min-height: 54px;
  max-height: 54px;
}

.opx-workflow-phone {
  margin: 0 0 8px;
  padding: 7px 9px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.58);
  color: #bfdbfe;
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opx-workflow-list {
  display: grid;
  gap: 10px;
  margin: 0 0 8px;
}

.opx-workflow-section {
  display: grid;
  gap: 8px;
}

.opx-workflow-section-header {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 62px;
  gap: 8px;
  align-items: center;
  min-height: 28px;
  padding: 0 2px;
}

.opx-workflow-section.is-readonly .opx-workflow-section-header {
  grid-template-columns: minmax(0, 1fr) 62px;
}

.opx-workflow-section-title {
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 800;
  line-height: 16px;
}

.opx-workflow-section-state {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  line-height: 15px;
  text-align: right;
}

.opx-workflow-checkbox {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #2fd17c;
}

.opx-workflow-checkbox:disabled {
  opacity: 0.55;
}

.opx-workflow-group {
  display: grid;
  gap: 5px;
  padding: 6px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.36);
}

.opx-workflow-group-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 50px;
  gap: 7px;
  align-items: center;
}

.opx-workflow-group-label {
  min-width: 0;
  color: #dbeafe;
  font-size: 12px;
  font-weight: 800;
  line-height: 16px;
}

.opx-workflow-group-state {
  color: #94a3b8;
  font-size: 11px;
  line-height: 15px;
  text-align: right;
}

.opx-workflow-step {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 54px 42px;
  gap: 7px;
  align-items: center;
  padding-left: 4px;
}

.opx-workflow-step-num {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #94a3b8;
  font-size: 11px;
  font-weight: 800;
}

.opx-workflow-step-label {
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.62);
  color: #cbd5e1;
  font-size: 12px;
  line-height: 16px;
}

.opx-workflow-step-state {
  color: #94a3b8;
  font-size: 11px;
  line-height: 15px;
  text-align: right;
}

.opx-workflow-step[data-selected="false"] {
  opacity: 0.72;
}

.opx-workflow-step[data-status="running"] .opx-workflow-step-num,
.opx-workflow-step[data-status="running"] .opx-workflow-step-label {
  border-color: rgba(251, 191, 36, 0.54);
  color: #fbbf24;
}

.opx-workflow-step[data-status="completed"] .opx-workflow-step-num,
.opx-workflow-step[data-status="completed"] .opx-workflow-step-label,
.opx-workflow-step[data-status="skipped"] .opx-workflow-step-num,
.opx-workflow-step[data-status="skipped"] .opx-workflow-step-label {
  border-color: rgba(47, 209, 124, 0.54);
  color: #86efac;
}

.opx-workflow-step[data-status="failed"] .opx-workflow-step-num,
.opx-workflow-step[data-status="failed"] .opx-workflow-step-label {
  border-color: rgba(248, 113, 113, 0.54);
  color: #fca5a5;
}

.opx-workflow-continue {
  width: 44px;
  height: 24px;
  border: 0;
  border-radius: 5px;
  background: #2fd17c;
  color: #04130a;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
}

.opx-workflow-code-copy {
  width: 72px;
  height: 24px;
  border: 1px solid rgba(47, 209, 124, 0.46);
  border-radius: 5px;
  background: rgba(47, 209, 124, 0.12);
  color: #bbf7d0;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
}

.opx-workflow-code-copy:hover,
.opx-workflow-code-copy.is-copied {
  border-color: rgba(47, 209, 124, 0.78);
  background: rgba(47, 209, 124, 0.2);
  color: #dcfce7;
}

.opx-otp-dialog[hidden] {
  display: none;
}

.opx-otp-dialog {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(2, 6, 23, 0.66);
}

.opx-otp-dialog-panel {
  box-sizing: border-box;
  width: min(300px, calc(100vw - 48px));
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 8px;
  background: #0b1120;
  box-shadow: 0 18px 44px rgba(2, 6, 23, 0.42);
}

.opx-otp-dialog-title {
  margin: 0 0 10px;
  color: #e5f7ef;
  font-size: 14px;
  font-weight: 800;
  line-height: 20px;
}

.opx-otp-dialog-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.opx-otp-dialog-actions .opx-button {
  margin-bottom: 0;
}

.opx-account-list {
  display: grid;
  gap: 9px;
  margin: 0 0 8px;
}

.opx-account-group {
  display: grid;
  gap: 7px;
  padding: 8px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.34);
}

.opx-account-group-title {
  min-width: 0;
  color: #bbf7d0;
  font-size: 12px;
  font-weight: 800;
  line-height: 16px;
  overflow-wrap: anywhere;
}

.opx-account-group-list {
  display: grid;
  gap: 7px;
}

.opx-account-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 72px;
  gap: 8px;
  align-items: center;
  min-height: 52px;
  padding: 8px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 7px;
  background: rgba(15, 23, 42, 0.62);
}

.opx-account-row[data-session-expired="true"] {
  border-color: rgba(251, 191, 36, 0.42);
}

.opx-account-row[data-plan-expired="true"] {
  border-color: rgba(248, 113, 113, 0.42);
  background: rgba(127, 29, 29, 0.18);
}

.opx-account-main {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.opx-account-main strong {
  min-width: 0;
  color: #e5f7ef;
  font-size: 12px;
  line-height: 16px;
  overflow-wrap: anywhere;
}

.opx-account-main span {
  min-width: 0;
  color: #94a3b8;
  font-size: 11px;
  line-height: 15px;
  overflow-wrap: anywhere;
}

.opx-account-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.opx-account-plan {
  font-weight: 800;
}

.opx-account-plan.is-plus {
  color: #86efac;
}

.opx-account-plan.is-free {
  color: #facc15;
}

.opx-account-plan.is-unknown {
  color: #94a3b8;
}

.opx-account-row-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
}

.opx-settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  place-items: start center;
  padding: 22px 10px;
  background: rgba(2, 6, 23, 0.58);
}

.opx-settings-overlay[hidden] {
  display: none;
}

.opx-settings-dialog {
  box-sizing: border-box;
  width: min(300px, calc(100vw - 52px));
  max-height: calc(100vh - 44px);
  overflow-y: auto;
  padding: 10px;
  border: 1px solid rgba(47, 209, 124, 0.38);
  border-radius: 8px;
  background: #0b1220;
  color: #e5f7ef;
  box-shadow: 0 20px 52px rgba(0, 0, 0, 0.42);
}

.opx-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 10px;
  color: #bbf7d0;
  font-size: 14px;
  line-height: 18px;
}

.opx-settings-title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.opx-version-badge {
  padding: 1px 6px;
  border: 1px solid rgba(47, 209, 124, 0.34);
  border-radius: 999px;
  background: rgba(47, 209, 124, 0.08);
  color: #93e4bd;
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
}

.opx-settings-header .opx-icon-button {
  width: 28px;
  height: 28px;
  font-size: 18px;
}

.opx-settings-dialog .opx-grid {
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}

.opx-setting-item {
  margin: 0 0 8px;
  padding: 8px;
  border: 1px solid rgba(47, 209, 124, 0.22);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.54);
}

.opx-setting-item .opx-check-row {
  margin-bottom: 4px;
}

.opx-setting-description {
  margin-left: 26px;
  color: #94a3b8;
  font-size: 11px;
  line-height: 15px;
}

.opx-external-link-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 34px;
  margin: 0 0 8px;
  padding: 8px 10px;
  border: 1px solid rgba(47, 209, 124, 0.34);
  border-radius: 6px;
  background: rgba(47, 209, 124, 0.1);
  color: #bbf7d0;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
  text-align: left;
}

.opx-telegram-icon {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
}

.opx-external-link-button:hover {
  border-color: rgba(47, 209, 124, 0.7);
  background: rgba(47, 209, 124, 0.16);
  color: #dcfce7;
}

.opx-external-link-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.opx-check-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  margin: 0 0 10px;
  color: #e5f7ef;
  cursor: pointer;
  font-size: 12px;
  line-height: 16px;
}

.opx-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #2fd17c;
}

.opx-address-summary {
  min-height: 68px;
}

.opx-settings-buttons {
  margin-top: 2px;
}

.opx-section-title {
  margin: 10px 0 6px;
  color: #bbf7d0;
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
}

.opx-copy-list {
  display: grid;
  gap: 5px;
}

.opx-copy-section {
  display: grid;
  gap: 5px;
  margin: 5px 0 1px;
}

.opx-copy-section-title {
  color: #93e4bd;
  font-size: 11px;
  font-weight: 700;
  line-height: 15px;
}

.opx-copy-section-body {
  display: grid;
  gap: 5px;
}

.opx-accordion-section {
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.56);
}

.opx-accordion-section summary {
  padding: 7px 8px;
  color: #93e4bd;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  line-height: 15px;
  list-style-position: inside;
}

.opx-accordion-section .opx-copy-section-body {
  padding: 0 6px 6px;
}

.opx-copy-row,
.opx-empty-inline {
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 7px 8px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.72);
  color: #cbd5e1;
  font: inherit;
  font-size: 11px;
  line-height: 15px;
  text-align: left;
  word-break: break-word;
}

.opx-copy-row {
  cursor: pointer;
}

.opx-copy-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 4px;
  align-items: start;
}

.opx-copy-row:hover {
  border-color: rgba(47, 209, 124, 0.48);
  color: #e5f7ef;
}

.opx-copy-row.is-copied {
  border-color: rgba(47, 209, 124, 0.72);
  background: rgba(47, 209, 124, 0.12);
}

.opx-copy-label {
  color: #94a3b8;
  white-space: nowrap;
}

.opx-copy-row strong {
  min-width: 0;
  color: #e5f7ef;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.opx-copy-feedback {
  align-self: start;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(47, 209, 124, 0.16);
  color: #86efac !important;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
  white-space: nowrap;
}

.opx-copy-feedback[hidden] {
  display: none;
}

.opx-empty-inline {
  color: #94a3b8;
  border-style: dashed;
}

.opx-sms-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px;
  gap: 6px;
  align-items: start;
}

.opx-sms-input {
  min-height: 52px;
  max-height: 72px;
  resize: vertical;
}

.opx-sms-input-row .opx-button {
  margin-bottom: 8px;
}

.opx-sms-actions {
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.86fr) minmax(0, 0.86fr);
}

.opx-sms-targets {
  display: grid;
  gap: 6px;
}

.opx-sms-target-row {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 84px;
  gap: 8px;
  align-items: center;
  min-height: 44px;
  padding: 7px 8px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.72);
  cursor: pointer;
}

.opx-sms-target-row[data-selected="true"] {
  border-color: rgba(147, 228, 189, 0.62);
  background: rgba(20, 83, 45, 0.18);
}

.opx-sms-target-row[data-status="found"] {
  border-color: rgba(47, 209, 124, 0.5);
  background: rgba(47, 209, 124, 0.1);
}

.opx-sms-target-row[data-status="error"] {
  border-color: rgba(248, 113, 113, 0.42);
  background: rgba(127, 29, 29, 0.2);
}

.opx-sms-target-radio {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #2fd17c;
}

.opx-sms-target-main {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.opx-sms-target-main strong,
.opx-sms-target-main span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.opx-sms-target-main strong {
  color: #e5f7ef;
  font-size: 12px;
  line-height: 16px;
}

.opx-sms-target-main span {
  color: #94a3b8;
  font-size: 11px;
  line-height: 15px;
}

.opx-sms-target-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
}

.opx-sms-target-actions .opx-mini-button {
  width: 100%;
  height: 24px;
}

.opx-sms-code-chip {
  box-sizing: border-box;
  min-width: 56px;
  max-width: 92px;
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid rgba(47, 209, 124, 0.44);
  border-radius: 999px;
  background: #182235;
  color: #bbf7d0;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opx-sms-code-chip:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.opx-sms-code-chip.is-copied {
  background: #2fd17c;
  color: #04130a;
}

.opx-sms-table {
  display: grid;
  gap: 5px;
}

.opx-sms-table-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(64px, 0.8fr) 62px;
  gap: 6px;
  align-items: center;
  min-height: 32px;
  padding: 5px 6px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.58);
}

.opx-sms-table-head {
  min-height: 24px;
  background: transparent;
  border-color: transparent;
  color: #93e4bd;
  font-weight: 700;
}

.opx-sms-table-cell {
  min-width: 0;
  color: #cbd5e1;
  font-size: 11px;
  line-height: 15px;
  overflow-wrap: anywhere;
}

@media (max-height: 640px) {
  .opx-shell {
    top: 12px;
    max-height: calc(100vh - 24px);
  }

  .opx-panel {
    max-height: calc(100vh - 24px);
  }
}
`;
