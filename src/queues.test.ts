import { BaseQueue } from "./queues";

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

    it("should process multiple items in the queue", () => {
      const itemCallback = jest.fn().mockReturnValue(true);
      queue = new BaseQueue({
        itemCallback,
      });
      queue.add("test1");
      queue.add("test2");
      queue.process();
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
