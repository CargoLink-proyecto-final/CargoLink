import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LoadsAssistantService } from './loads-assistant.service';
import { AssistantMessageDto } from './dto/assistant-message.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';

@ApiTags('Loads Assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('loads/assistant')
export class LoadsAssistantController {
  constructor(private assistant: LoadsAssistantService) {}

  @Get('flow')
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR', 'ADMIN')
  @ApiOperation({ summary: 'Get the conversational flow config + assistant status' })
  async getFlow() {
    const flow = await this.assistant.getFlow();
    return { flow, ...this.assistant.status() };
  }

  @Post('message')
  @UseGuards(RolesGuard)
  @Roles('CARGO_GENERATOR')
  @ApiOperation({ summary: 'Send a turn to the assistant and get the updated draft (Shipper only)' })
  chat(@Body() dto: AssistantMessageDto) {
    return this.assistant.chat(dto.messages, dto.draft ?? {});
  }

  @Put('flow')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Edit the conversational flow config (Admin only)' })
  updateFlow(@Body() dto: UpdateFlowDto) {
    return this.assistant.updateFlow(dto);
  }
}
