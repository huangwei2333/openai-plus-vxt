export interface WorkflowRunControl {
  readonly running: boolean;
  readonly stopRequested: boolean;
  start(): boolean;
  requestStop(): boolean;
  finish(): void;
}

export function createWorkflowRunControl(): WorkflowRunControl {
  let running = false;
  let stopRequested = false;

  return {
    get running() {
      return running;
    },
    get stopRequested() {
      return stopRequested;
    },
    start() {
      if (running) {
        return false;
      }
      running = true;
      stopRequested = false;
      return true;
    },
    requestStop() {
      if (!running) {
        return false;
      }
      stopRequested = true;
      return true;
    },
    finish() {
      running = false;
    },
  };
}

export function getWorkflowPrimaryButtonLabel(control: Pick<WorkflowRunControl, 'running' | 'stopRequested'>): string {
  if (!control.running) {
    return '开始';
  }
  return control.stopRequested ? '停止中...' : '停止自动化';
}
