import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';
import { ChatBroadcaster } from './chat-broadcaster';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule aporta SocketAuthService, que valida el token del handshake.
  imports: [AuthModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, ChatBroadcaster],
})
export class MessagesModule {}
