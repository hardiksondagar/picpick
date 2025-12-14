#!/usr/bin/env python3
"""
Export Starred/Rated Photos
Exports photos based on rating or starred status to a separate folder.
"""

import sqlite3
import shutil
from pathlib import Path
from datetime import datetime
import argparse
import json

# Configuration
DB_PATH = Path(__file__).parent / "photos.db"
BASE_DIR = Path(__file__).parent.parent


def get_db_connection():
    """Get SQLite connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def export_photos(
    output_dir: Path,
    min_rating: int = 3,
    starred_only: bool = False,
    copy_mode: bool = True,
    preserve_structure: bool = True
):
    """
    Export photos based on criteria.

    Args:
        output_dir: Directory to export photos to
        min_rating: Minimum rating (0-5) to include
        starred_only: Only export starred photos
        copy_mode: If True, copy files. If False, create symlinks
        preserve_structure: If True, preserve folder structure
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Build query
    conditions = []
    params = []

    if starred_only:
        conditions.append("is_starred = 1")
    else:
        conditions.append("rating >= ?")
        params.append(min_rating)

    where_clause = " AND ".join(conditions)

    cursor.execute(f"""
        SELECT filepath, filename, folder, rating, is_starred
        FROM photos
        WHERE {where_clause}
        ORDER BY folder, taken_at, filename
    """, params)

    photos = cursor.fetchall()
    conn.close()

    if not photos:
        print("⚠ No photos match the criteria!")
        return

    print(f"Found {len(photos)} photos to export")

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Export photos
    exported = 0
    errors = []

    for photo in photos:
        src = Path(photo['filepath'])

        if not src.exists():
            errors.append(f"File not found: {src}")
            continue

        if preserve_structure:
            # Preserve folder structure
            dest_dir = output_dir / photo['folder']
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / photo['filename']
        else:
            # Flat structure with folder prefix
            safe_folder = photo['folder'].replace('/', '_').replace('\\', '_')
            dest = output_dir / f"{safe_folder}_{photo['filename']}"

        try:
            if copy_mode:
                shutil.copy2(src, dest)
            else:
                # Create symlink
                if dest.exists():
                    dest.unlink()
                dest.symlink_to(src)
            exported += 1

        except Exception as e:
            errors.append(f"Error exporting {src}: {e}")

    print(f"\n✓ Exported {exported} photos to {output_dir}")

    if errors:
        print(f"\n⚠ {len(errors)} errors:")
        for err in errors[:10]:
            print(f"  - {err}")
        if len(errors) > 10:
            print(f"  ... and {len(errors) - 10} more")


def export_file_list(
    output_file: Path,
    min_rating: int = 3,
    starred_only: bool = False,
    format: str = 'txt'
):
    """
    Export a list of file paths (for album software).

    Args:
        output_file: File to write the list to
        min_rating: Minimum rating (0-5) to include
        starred_only: Only export starred photos
        format: Output format ('txt', 'json', 'csv')
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Build query
    conditions = []
    params = []

    if starred_only:
        conditions.append("is_starred = 1")
    else:
        conditions.append("rating >= ?")
        params.append(min_rating)

    where_clause = " AND ".join(conditions)

    cursor.execute(f"""
        SELECT filepath, filename, folder, rating, is_starred, taken_at
        FROM photos
        WHERE {where_clause}
        ORDER BY folder, taken_at, filename
    """, params)

    photos = cursor.fetchall()
    conn.close()

    if not photos:
        print("⚠ No photos match the criteria!")
        return

    if format == 'txt':
        with open(output_file, 'w') as f:
            for photo in photos:
                f.write(f"{photo['filepath']}\n")

    elif format == 'json':
        data = [{
            'filepath': photo['filepath'],
            'filename': photo['filename'],
            'folder': photo['folder'],
            'rating': photo['rating'],
            'starred': bool(photo['is_starred']),
            'taken_at': photo['taken_at']
        } for photo in photos]

        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)

    elif format == 'csv':
        with open(output_file, 'w') as f:
            f.write("filepath,filename,folder,rating,starred,taken_at\n")
            for photo in photos:
                f.write(f'"{photo["filepath"]}","{photo["filename"]}","{photo["folder"]}",{photo["rating"]},{photo["is_starred"]},{photo["taken_at"] or ""}\n')

    print(f"✓ Exported list of {len(photos)} photos to {output_file}")


def print_summary():
    """Print summary of rated photos."""
    conn = get_db_connection()
    cursor = conn.cursor()

    print("="*50)
    print("RATING SUMMARY")
    print("="*50)

    cursor.execute("""
        SELECT rating, COUNT(*) as cnt
        FROM photos
        GROUP BY rating
        ORDER BY rating DESC
    """)

    for row in cursor.fetchall():
        stars = '★' * row['rating'] if row['rating'] > 0 else 'Unrated'
        print(f"  {stars:12} : {row['cnt']:,} photos")

    cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE is_starred = 1")
    starred = cursor.fetchone()['cnt']
    print(f"\n  {'★ Starred':12} : {starred:,} photos")

    print("\n" + "-"*50)
    print("RECOMMENDATION:")

    cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE rating >= 3")
    keepers = cursor.fetchone()['cnt']
    print(f"  Photos rated 3+ stars: {keepers:,}")
    print(f"  (Target for album: 250-300)")

    conn.close()


def main():
    parser = argparse.ArgumentParser(description='PicPick - Export starred photos')
    parser.add_argument('--output', '-o', type=str, help='Output directory or file')
    parser.add_argument('--min-rating', '-r', type=int, default=3, help='Minimum rating (0-5)')
    parser.add_argument('--starred', '-s', action='store_true', help='Export only starred photos')
    parser.add_argument('--symlink', action='store_true', help='Create symlinks instead of copying')
    parser.add_argument('--flat', action='store_true', help='Flat structure (no folders)')
    parser.add_argument('--list', '-l', type=str, choices=['txt', 'json', 'csv'], help='Export as file list')
    parser.add_argument('--summary', action='store_true', help='Print rating summary only')

    args = parser.parse_args()

    if not DB_PATH.exists():
        print("⚠ Database not found! Run 'python index_photos.py' first.")
        return

    if args.summary:
        print_summary()
        return

    if not args.output:
        # Default output directory
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        args.output = str(BASE_DIR / f"export_{timestamp}")

    if args.list:
        # Export as file list
        output_file = Path(args.output)
        if output_file.suffix == '':
            output_file = output_file.with_suffix(f'.{args.list}')
        export_file_list(output_file, args.min_rating, args.starred, args.list)
    else:
        # Export files
        export_photos(
            Path(args.output),
            args.min_rating,
            args.starred,
            copy_mode=not args.symlink,
            preserve_structure=not args.flat
        )

    print_summary()


if __name__ == "__main__":
    main()

