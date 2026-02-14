import asyncio
from sqlalchemy import text
from src.shared_kernel import get_db_session

async def inspect():
    async for session in get_db_session():
        # Query information_schema to get columns for chat.chat_messages
        stmt = text("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'chat' AND table_name = 'chat_messages'")
        result = await session.execute(stmt)
        rows = result.fetchall()
        print("Columns in chat.chat_messages:")
        for row in rows:
            print(f"- {row[0]} ({row[1]})")
        break

if __name__ == "__main__":
    asyncio.run(inspect())
