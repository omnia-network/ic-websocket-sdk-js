import { AckMessagesQueue, BaseQueue } from "./queues";

describe("BaseQueue", () => {
  let queue: BaseQueue<string>;

  beforeEach(() => {
    queue = new BaseQueue({
      itemCallback: (message: string) => true,
    });
  });

  describe("add", () => {
    it("should add an item to the queue", () => {
      queue.add("test");
      expect(queue["_queue"]).toEqual(["test"]);
    });
  });

  describe("addAndProcess", () => {
    it("should add an item to the queue and process it", () => {
      const itemCallback = jest.fn().mockReturnValue(true);
      queue = new BaseQueue({
        itemCallback,
      });
      queue.addAndProcess("test");
      expect(queue["_queue"]).toEqual([]);
      expect(itemCallback).toHaveBeenCalledWith("test");
    });
  });

  describe("enableAndProcess", () => {
    it("should enable the queue and process it", () => {
      const itemCallback = jest.fn().mockReturnValue(true);
      queue = new BaseQueue({
        itemCallback,
        isDisabled: true,
      });
      queue.add("test");
      queue.enableAndProcess();
      expect(queue["_queue"]).toEqual([]);
      expect(itemCallback).toHaveBeenCalledWith("test");
    });
  });

  describe("process", () => {
    it("should process an item in the queue", () => {
      const itemCallback = jest.fn().mockReturnValue(true);
      queue = new BaseQueue({
        itemCallback,
      });
      queue.add("test");
      queue.process();
      expect(queue["_queue"]).toEqual([]);
      expect(itemCallback).toHaveBeenCalledWith("test");
    });

    it("should process multiple items in the queue", async () => {
      const itemCallback = jest.fn().mockReturnValue(true);
      queue = new BaseQueue({
        itemCallback,
      });
      queue.add("test1");
      queue.add("test2");
      queue.process();

      // the queue processing is async, so we need to wait for it to finish
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(queue["_queue"]).toEqual([]);
      expect(itemCallback).toHaveBeenCalledTimes(2);
    });

    it("should not process an item if the queue is disabled", () => {
      const itemCallback = jest.fn().mockReturnValue(true);
      queue = new BaseQueue({
        itemCallback,
        isDisabled: true,
      });
      queue.add("test");
      queue.process();
      expect(queue["_queue"]).toEqual(["test"]);
      expect(itemCallback).not.toHaveBeenCalled();
    });

    it("should stop processing if the item callback returns false", () => {
      const itemCallback = jest.fn().mockReturnValue(false);
      queue = new BaseQueue({
        itemCallback,
      });
      queue.add("test1");
      queue.add("test2");
      queue.process();
      expect(queue["_queue"]).toEqual(["test2"]);
      expect(itemCallback).toHaveBeenCalledWith("test1");
    });

    it("should stop processing if there are no items in the queue", () => {
      const itemCallback = jest.fn().mockReturnValue(true);
      queue = new BaseQueue({
        itemCallback,
      });
      queue.process();
      expect(queue["_queue"]).toEqual([]);
      expect(itemCallback).not.toHaveBeenCalled();
    });
  });
});

describe("AckMessagesQueue", () => {
  let queue: AckMessagesQueue;
  const expirationMs = 1000;

  beforeEach(() => {
    queue = new AckMessagesQueue({
      expirationMs,
      timeoutExpiredCallback: jest.fn(),
    });
  });

  describe("add", () => {
    it("should add an item to the queue", () => {
      queue.add(BigInt(1));
      expect(queue.last()?.sequenceNumber).toEqual(BigInt(1));
    });

    it("should throw an error if sequence number is not greater than last", () => {
      queue.add(BigInt(1));
      expect(() => queue.add(BigInt(1))).toThrow("Sequence number 1 is not greater than last: 1");
      expect(() => queue.add(BigInt(0))).toThrow("Sequence number 0 is not greater than last: 1");
    });
  });

  describe("ack", () => {
    it("should remove all items up to and including the acked item", () => {
      queue.add(BigInt(1));
      queue.add(BigInt(2));
      queue.ack(BigInt(1));
      expect(queue.last()?.sequenceNumber).toEqual(BigInt(2));
    });

    it("should not do anything if sequence number is lower than the last and not in the queue", () => {
      queue.add(BigInt(1));
      queue.add(BigInt(2));
      queue.ack(BigInt(0));
      expect(queue.last()?.sequenceNumber).toEqual(BigInt(2));
    });

    it("should throw an error if sequence number is greater than last", () => {
      queue.add(BigInt(1));
      expect(() => queue.ack(BigInt(2))).toThrow("Sequence number 2 is greater than last: 1");
    });

    it("should call the timeoutExpiredCallback for expired items when receiving the ack", () => {
      queue.add(BigInt(1));
      jest.useFakeTimers().setSystemTime(Date.now() + expirationMs + 1);
      queue.add(BigInt(2));
      queue.ack(BigInt(1));
      jest.advanceTimersByTime(expirationMs + 1);
      expect(queue.last()).toBeNull();
      expect(queue["_timeoutExpiredCallback"]).toHaveBeenCalledWith([BigInt(2)]);
    });

    it("should call the timeoutExpiredCallback for all expired items after not receiving the ack", () => {
      queue.add(BigInt(1));
      queue.add(BigInt(2));
      queue.add(BigInt(3));
      jest.useFakeTimers();
      queue.ack(BigInt(1));
      jest.advanceTimersByTime(1000);
      expect(queue.last()).toBeNull();
      expect(queue["_timeoutExpiredCallback"]).toHaveBeenCalledWith([BigInt(2), BigInt(3)]);
    });
  });

  describe("last", () => {
    it("should return null if the queue is empty", () => {
      expect(queue.last()).toBeNull();
    });

    it("should return the last item in the queue", () => {
      queue.add(BigInt(1));
      queue.add(BigInt(2));
      expect(queue.last()?.sequenceNumber).toEqual(BigInt(2));
    });
  });
});
