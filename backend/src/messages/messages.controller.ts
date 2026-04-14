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

  @Post('trip/:tripId')
  @ApiOperation({ summary: 'Send a message in a trip conversation' })
  send(
    @CurrentUser('id') userId: string,
    @Param('tripId') tripId: string,
    @Body() data: { content: string },
  ) {
    return this.messagesService.create(userId, tripId, data.content);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread message count' })
  getUnreadCount(@CurrentUser('id') userId: string) {
    return this.messagesService.getUnreadTotal(userId);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Get list of trip-based conversations' })
  getConversations(@CurrentUser('id') userId: string) {
    return this.messagesService.getConversationList(userId);
  }

  @Get('trip/:tripId')
  @ApiOperation({ summary: 'Get messages for a trip' })
  getTripMessages(
    @CurrentUser('id') userId: string,
    @Param('tripId') tripId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.messagesService.getTripMessages(tripId, userId, page, limit);
  }

  @Patch('trip/:tripId/read')
  @ApiOperation({ summary: 'Mark trip messages as read' })
  markAsRead(
    @CurrentUser('id') userId: string,
    @Param('tripId') tripId: string,
  ) {
    return this.messagesService.markAsRead(tripId, userId);
  }
}
