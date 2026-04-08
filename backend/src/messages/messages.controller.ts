import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Post(':receiverId')
  @ApiOperation({ summary: 'Send a message' })
  send(
    @CurrentUser('id') userId: string,
    @Param('receiverId') receiverId: string,
    @Body() data: { content: string },
  ) {
    return this.messagesService.create(userId, receiverId, data.content);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Get list of conversations' })
  getConversations(@CurrentUser('id') userId: string) {
    return this.messagesService.getConversationList(userId);
  }

  @Get('conversation/:userId')
  @ApiOperation({ summary: 'Get messages with a specific user' })
  getConversation(
    @CurrentUser('id') myId: string,
    @Param('userId') otherId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.messagesService.getConversation(myId, otherId, page, limit);
  }

  @Patch('read/:senderId')
  @ApiOperation({ summary: 'Mark messages as read' })
  markAsRead(
    @CurrentUser('id') userId: string,
    @Param('senderId') senderId: string,
  ) {
    return this.messagesService.markAsRead(userId, senderId);
  }
}
