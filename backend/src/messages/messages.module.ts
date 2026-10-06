import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';
import { ChatBroadcaster } from './chat-broadcaster';

@Module({
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, ChatBroadcaster],
})
export class MessagesModule {}
