import { Router } from 'express';
import {
  handleCreateMessage,
  handleGetMessages,
  handleHeartbeat,
  handleJoinRoom,
  handleLeaveRoom,
  renderChatPage,
} from './chatController';

const chatRouter = Router();

// チャット画面（EJS）
chatRouter.get('/chat', renderChatPage);

// チャット REST API
chatRouter.post('/api/chat/join', handleJoinRoom);
chatRouter.post('/api/chat/leave', handleLeaveRoom);
chatRouter.post('/api/chat/heartbeat', handleHeartbeat);
chatRouter.get('/api/chat/messages', handleGetMessages);
chatRouter.post('/api/chat/messages', handleCreateMessage);

export default chatRouter;