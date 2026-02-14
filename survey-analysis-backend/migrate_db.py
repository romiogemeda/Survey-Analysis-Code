import asyncio
from sqlalchemy import text
from src.shared_kernel import get_db_session

async def migrate():
    print("Migrating database...")
    async for session in get_db_session():
        try:
            # Add missing columns
            print("Adding chart_code column...")
            await session.execute(text("ALTER TABLE chat.chat_messages ADD COLUMN IF NOT EXISTS chart_code TEXT"))
            
            print("Adding chart_data column...")
            await session.execute(text("ALTER TABLE chat.chat_messages ADD COLUMN IF NOT EXISTS chart_data JSON"))
            
            print("Adding chart_type column...")
            await session.execute(text("ALTER TABLE chat.chat_messages ADD COLUMN IF NOT EXISTS chart_type VARCHAR(50)"))
            
            await session.commit()
            print("Migration successful!")
        except Exception as e:
            print(f"Migration failed: {e}")
            await session.rollback()
        break

if __name__ == "__main__":
    asyncio.run(migrate())
