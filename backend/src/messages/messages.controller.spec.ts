import { Test, TestingModule } from '@nestjs/testing';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

describe('MessagesController', () => {
  let controller: MessagesController;
  let service: {
    create: jest.Mock;
    getUnreadTotal: jest.Mock;
    getConversationList: jest.Mock;
    getTripMessages: jest.Mock;
    markAsRead: jest.Mock;
  };

  const userId = 'user-1';
  const tripId = 'trip-1';

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      getUnreadTotal: jest.fn(),
      getConversationList: jest.fn(),
      getTripMessages: jest.fn(),
      markAsRead: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [{ provide: MessagesService, useValue: service }],
    }).compile();

    controller = module.get<MessagesController>(MessagesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('send', () => {
    it('delegates to service.create with user, trip and content', () => {
      const created = { id: 'msg-1' };
      service.create.mockReturnValue(created);

      const result = controller.send(userId, tripId, { content: 'hello' });

      expect(service.create).toHaveBeenCalledWith(userId, tripId, 'hello');
      expect(result).toBe(created);
    });
  });

  describe('getUnreadCount', () => {
    it('delegates to service.getUnreadTotal', () => {
      const value = { unreadCount: 5 };
      service.getUnreadTotal.mockReturnValue(value);

      const result = controller.getUnreadCount(userId);

      expect(service.getUnreadTotal).toHaveBeenCalledWith(userId);
      expect(result).toBe(value);
    });
  });

  describe('getConversations', () => {
    it('delegates to service.getConversationList', () => {
      const list = [{ tripId }];
      service.getConversationList.mockReturnValue(list);

      const result = controller.getConversations(userId);

      expect(service.getConversationList).toHaveBeenCalledWith(userId);
      expect(result).toBe(list);
    });
  });

  describe('getTripMessages', () => {
    it('forwards the full user object, trip id and pagination', () => {
      const user = { id: userId, role: 'TRANSPORTER' };
      const page = { messages: [], total: 0, page: 2, limit: 10 };
      service.getTripMessages.mockReturnValue(page);

      const result = controller.getTripMessages(user, tripId, 2, 10);

      expect(service.getTripMessages).toHaveBeenCalledWith(tripId, user, 2, 10);
      expect(result).toBe(page);
    });

    it('forwards undefined pagination params unchanged', () => {
      const user = { id: userId, role: 'ADMIN' };
      service.getTripMessages.mockReturnValue({});

      controller.getTripMessages(user, tripId);

      expect(service.getTripMessages).toHaveBeenCalledWith(
        tripId,
        user,
        undefined,
        undefined,
      );
    });
  });

  describe('markAsRead', () => {
    it('delegates to service.markAsRead', () => {
      const value = { count: 2 };
      service.markAsRead.mockReturnValue(value);

      const result = controller.markAsRead(userId, tripId);

      expect(service.markAsRead).toHaveBeenCalledWith(tripId, userId);
      expect(result).toBe(value);
    });
  });
});
