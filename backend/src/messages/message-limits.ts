/**
 * Tope de largo del contenido de un mensaje.
 *
 * Vive acá y no en el DTO porque lo necesitan los dos caminos de entrada: el
 * `SendMessageDto` del `POST /messages/trip/:id` y `MessagesService.create`,
 * que es por donde pasan también los mensajes del gateway de sockets, que no
 * atraviesan el ValidationPipe. Tenerlo duplicado era garantía de que se
 * separaran con el tiempo.
 */
export const MAX_MESSAGE_LENGTH = 2000;
