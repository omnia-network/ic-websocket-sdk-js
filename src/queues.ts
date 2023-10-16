/**
 * The function that will be called when an item is processed.
 * If the function returns false, the processing will stop.
 */
type QueueItemCallback<T> = (message: T) => boolean | Promise<boolean>;

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
      throw new Error("itemCallback is required");
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
    // process the item, making sure we wait for the result before processing the next item
    Promise.resolve(this._itemCallback(item!)).then((shouldContinue) => {
      if (shouldContinue) {
        this._processNext();
      } else {
        this._isProcessing = false;
      }
    }).catch(() => {
      this._isProcessing = false;
    });
  }
}

type AckMessagesQueueArgs = {
  expirationMs: number;
  timeoutExpiredCallback: AckTimeoutExpiredCallback;
}

type AckMessage = {
  sequenceNumber: bigint;
  addedAt: number;
}

type AckTimeoutExpiredCallback = (notReceivedAck: AckMessage['sequenceNumber'][]) => void;

export class AckMessagesQueue {
  private _queue: AckMessage[] = [];
  private _expirationMs: number;
  private _timeoutExpiredCallback: AckTimeoutExpiredCallback;
  private _lastAckTimeout: NodeJS.Timeout | null = null;

  constructor(args: AckMessagesQueueArgs) {
    if (!args.expirationMs) {
      throw new Error("checkTimeoutMs is required");
    }
    this._expirationMs = Math.floor(args.expirationMs); // make sure it's an integer

    if (!args.timeoutExpiredCallback) {
      throw new Error("timeoutExpiredCallback is required");
    }
    this._timeoutExpiredCallback = args.timeoutExpiredCallback;
  }

  private _startLastAckTimeout() {
    this._lastAckTimeout = setTimeout(() => {
      this._onTimeoutExpired(this._queue);
    }, this._expirationMs);
  }

  private _restartLastAckTimeout() {
    if (this._lastAckTimeout) {
      clearTimeout(this._lastAckTimeout);
    }

    this._startLastAckTimeout();
  }

  private _onTimeoutExpired(items: AckMessage[]) {
    this._timeoutExpiredCallback(items.map((item) => item.sequenceNumber));
    this._queue = [];
  }

  public add(sequenceNumber: bigint) {
    const last = this.last();
    if (last && sequenceNumber <= last.sequenceNumber) {
      throw new Error(`Sequence number ${sequenceNumber} is not greater than last: ${last.sequenceNumber}`);
    }

    this._queue.push({
      sequenceNumber,
      addedAt: Date.now(),
    });

    if (!this._lastAckTimeout) {
      this._startLastAckTimeout();
    }
  }

  public ack(sequenceNumber: bigint) {
    const index = this._queue.findIndex((item) => item.sequenceNumber === sequenceNumber);
    if (index >= 0) {
      // remove all items up to and including the acked item
      this._queue.splice(0, index + 1);
    } else {
      const last = this.last();
      // we throw an error only if the received sequence number is not in the queue
      // and is greater than the last sequence number in the queue
      if (last && sequenceNumber > last.sequenceNumber) {
        throw new Error(`Sequence number ${sequenceNumber} is greater than last: ${last.sequenceNumber}`);
      }
    }

    // for the remaining items in the queue, check if they have expired
    // if yes, call the callback for the first expired item
    for (const item of this._queue) {
      if (Date.now() - item.addedAt >= this._expirationMs) {
        // if it has expired and is still in the queue,
        // it means it has not been acked, so we call the callback
        return this._onTimeoutExpired([item]);
      }
    }

    this._restartLastAckTimeout();
  }

  public last(): AckMessage | null {
    if (this._queue.length === 0) {
      return null;
    }
    return this._queue[this._queue.length - 1];
  }

  public clear() {
    this._queue = [];
    if (this._lastAckTimeout) {
      clearTimeout(this._lastAckTimeout);
      this._lastAckTimeout = null;
    }
  }
}
