/**
 * The function that will be called when an item is processed.
 * If the function returns false, the processing will stop.
 */
type QueueItemCallback<T> = (message: T) => boolean;

type QueueArgs<T> = {
  /**
   * See {@link QueueItemCallback}
   */
  itemCallback: QueueItemCallback<T>;
  /**
   * If true, the queue will not process any items, even when {@link BaseQueue.process} is called.
   * To enable processing, call {@link BaseQueue.enable} or {@link BaseQueue.enableAndProcess}.
   * @default false
   */
  isDisabled?: boolean;
}

export class BaseQueue<T> {
  private _queue: T[] = [];
  private _itemCallback: QueueItemCallback<T>;
  private _canProcess = true;
  private _isProcessing = false;

  constructor(args: QueueArgs<T>) {
    if (!args.itemCallback) {
      throw new Error('processCallback is required');
    }
    this._itemCallback = args.itemCallback;

    if (args.isDisabled) {
      this.disable();
    }
  }

  public enable() {
    this._canProcess = true;
  }

  public disable() {
    this._canProcess = false;
  }

  public add(item: T) {
    this._queue.push(item);
  }

  public addAndProcess(item: T) {
    this.add(item);
    this.process();
  }

  public enableAndProcess() {
    this.enable();
    this.process();
  }

  public process() {
    if (!this._canProcess) {
      return;
    }

    if (this._isProcessing) {
      return;
    }

    this._isProcessing = true;
    this._processNext();
  }

  private _processNext() {
    if (!this._canProcess) {
      return;
    }

    if (this._queue.length === 0) {
      this._isProcessing = false;
      return;
    }

    const item = this._queue.shift();
    if (this._itemCallback(item!)) {
      this._processNext();
    }
  }
}
