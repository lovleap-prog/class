#!/usr/bin/env python3
"""
app/js/lib/holidays.js 의 LUNAR 표를 만드는 자리.

음력 공휴일(설날·부처님오신날·추석)은 해마다 옮겨 다닌다. 삭(합삭)과
동지·중기를 천문 계산으로 뽑아 그 해의 음력 달을 세우고, 설날은 1월 1일,
부처님오신날은 4월 8일, 추석은 8월 15일을 집는다.

    python3 tools/lunar-holidays.py 2026 2040

찍어 나온 줄을 holidays.js 의 LUNAR 에 붙이면 된다.
**넣기 전에 실제 달력과 맞춰 볼 것.** 하루라도 틀리면 수업하는 날이
'쉬는 날' 로 적힌다. 2020~2030년은 이미 맞춰 보았다.

대체공휴일은 일부러 계산하지 않는다. 규칙이 법으로 몇 번 바뀌었고 앞으로도
바뀐다. 그 자리는 학교 학사일정 문서가 맡는다.
"""
import math
import datetime

def norm(x): return x % 360.0

def jd_to_ymd(jd):
    jd = jd + 0.5
    z = int(math.floor(jd)); f = jd - z
    if z < 2299161: a = z
    else:
        alpha = int((z - 1867216.25) / 36524.25)
        a = z + 1 + alpha - alpha // 4
    b = a + 1524; c = int((b - 122.1) / 365.25)
    d = int(365.25 * c); e = int((b - d) / 30.6001)
    day = b - d - int(30.6001 * e) + f
    month = e - 1 if e < 14 else e - 13
    year = c - 4716 if month > 2 else c - 4715
    return year, month, day

def kst_day(jde):
    """JDE(TT 기준 근사) → KST 달력 날짜 (y, m, d) 정수"""
    jd = jde + 9.0 / 24.0          # UTC+9. ΔT 는 수분 단위라 날짜 판정에 영향 거의 없음
    y, m, d = jd_to_ymd(jd)
    return (y, m, int(math.floor(d)))

def new_moon(k):
    """Meeus 제49장 — k번째 삭의 JDE"""
    T = k / 1236.85
    jde = (2451550.09766 + 29.530588861 * k + 0.00015437 * T*T
           - 0.000000150 * T**3 + 0.00000000073 * T**4)
    E  = 1 - 0.002516 * T - 0.0000074 * T*T
    M  = norm(2.5534 + 29.10535670 * k - 0.0000014 * T*T - 0.00000011 * T**3)
    Mp = norm(201.5643 + 385.81693528 * k + 0.0107582 * T*T + 0.00001238 * T**3 - 0.000000058 * T**4)
    F  = norm(160.7108 + 390.67050284 * k - 0.0016118 * T*T - 0.00000227 * T**3 + 0.000000011 * T**4)
    O  = norm(124.7746 - 1.56375588 * k + 0.0020672 * T*T + 0.00000215 * T**3)
    r = math.radians
    c = (-0.40720 * math.sin(r(Mp))
         + 0.17241 * E * math.sin(r(M))
         + 0.01608 * math.sin(r(2*Mp))
         + 0.01039 * math.sin(r(2*F))
         + 0.00739 * E * math.sin(r(Mp - M))
         - 0.00514 * E * math.sin(r(Mp + M))
         + 0.00208 * E*E * math.sin(r(2*M))
         - 0.00111 * math.sin(r(Mp - 2*F))
         - 0.00057 * math.sin(r(Mp + 2*F))
         + 0.00056 * E * math.sin(r(2*Mp + M))
         - 0.00042 * math.sin(r(3*Mp))
         + 0.00042 * E * math.sin(r(M + 2*F))
         + 0.00038 * E * math.sin(r(M - 2*F))
         - 0.00024 * E * math.sin(r(2*Mp - M))
         - 0.00017 * math.sin(r(O))
         - 0.00007 * math.sin(r(Mp + 2*M))
         + 0.00004 * math.sin(r(2*Mp - 2*F))
         + 0.00004 * math.sin(r(3*M))
         + 0.00003 * math.sin(r(Mp + M - 2*F))
         + 0.00003 * math.sin(r(2*Mp + 2*F))
         - 0.00003 * math.sin(r(Mp + M + 2*F))
         + 0.00003 * math.sin(r(Mp - M + 2*F))
         - 0.00002 * math.sin(r(Mp - M - 2*F))
         - 0.00002 * math.sin(r(3*Mp + M))
         + 0.00002 * math.sin(r(4*Mp)))
    A = [
        (299.77 +  0.107408 * k - 0.009173 * T*T, 0.000325),
        (251.88 +  0.016321 * k,                  0.000165),
        (251.83 + 26.651886 * k,                  0.000164),
        (349.42 + 36.412478 * k,                  0.000126),
        ( 84.66 + 18.206239 * k,                  0.000110),
        (141.74 + 53.303771 * k,                  0.000062),
        (207.14 +  2.453732 * k,                  0.000060),
        (154.84 +  7.306860 * k,                  0.000056),
        ( 34.52 + 27.261239 * k,                  0.000047),
        (207.19 +  0.121824 * k,                  0.000042),
        (291.34 +  1.844379 * k,                  0.000040),
        (161.72 + 24.198154 * k,                  0.000037),
        (239.56 + 25.513099 * k,                  0.000035),
        (331.55 +  3.592518 * k,                  0.000023),
    ]
    add = sum(coef * math.sin(math.radians(norm(ang))) for ang, coef in A)
    return jde + c + add

def sun_longitude(jde):
    """겉보기 태양황경(도). Meeus 제25장 저정밀."""
    T = (jde - 2451545.0) / 36525.0
    L0 = norm(280.46646 + 36000.76983 * T + 0.0003032 * T*T)
    M  = norm(357.52911 + 35999.05029 * T - 0.0001537 * T*T)
    r = math.radians
    C = ((1.914602 - 0.004817*T - 0.000014*T*T) * math.sin(r(M))
         + (0.019993 - 0.000101*T) * math.sin(r(2*M))
         + 0.000289 * math.sin(r(3*M)))
    true_long = L0 + C
    omega = 125.04 - 1934.136 * T
    return norm(true_long - 0.00569 - 0.00478 * math.sin(r(omega)))

def solar_term(jde_guess, target):
    """황경이 target 도가 되는 순간을 뉴턴법으로 찾는다."""
    jde = jde_guess
    for _ in range(60):
        diff = (sun_longitude(jde) - target + 180) % 360 - 180
        if abs(diff) < 1e-7: break
        jde -= diff * 365.2422 / 360.0
    return jde

def winter_solstice(year):
    """그 해 12월 동지(황경 270°)의 JDE"""
    guess = 2451545.0 + 365.2422 * (year - 2000) + 355.0
    return solar_term(guess, 270.0)


import math, datetime

def nm_index_before(jde):
    k = math.floor((jde - 2451550.09766) / 29.530588861)
    while new_moon(k + 1) <= jde: k += 1
    while new_moon(k) > jde: k -= 1
    return k

def d(t): 
    y,m,dd = t
    return datetime.date(y,m,dd)

def build_year(gy):
    """gy년 설날·부처님오신날·추석을 돌려준다."""
    # 기준: (gy-1)년 동지가 든 달 = 11월
    ws0 = winter_solstice(gy-1)
    ws1 = winter_solstice(gy)
    k0 = nm_index_before(ws0)     # 11월 삭
    k1 = nm_index_before(ws1)     # 다음 11월 삭
    n = k1 - k0                   # 그 사이 달 수 (12 or 13)

    months = []   # (k, 시작날짜)
    for i in range(n + 1):
        months.append((k0 + i, d(kst_day(new_moon(k0 + i)))))

    leap_at = None
    if n == 13:
        # 중기(황경 30의 배수)를 품지 않는 첫 달이 윤달
        for i in range(1, n):
            start = months[i][1]; nxt = months[i+1][1]
            has = False
            for deg in range(0, 360, 30):
                guess = 2451545.0 + 365.2422 * (gy - 2000) + deg * 365.2422/360.0
                for off in (-365.2422, 0, 365.2422):
                    t = solar_term(guess + off, deg)
                    td = d(kst_day(t))
                    if start <= td < nxt: has = True
            if not has:
                leap_at = i; break

    # 달 번호 매기기: months[0] = 11월
    num = {}
    cur = 11; i = 0
    while i < n:
        num[i] = (cur, False)
        if leap_at == i + 1:
            num[i+1] = (cur, True)
            i += 2
        else:
            i += 1
        cur = cur % 12 + 1
    if leap_at is not None and leap_at not in num:
        pass

    def day_of(mon, day):
        for i,(m,is_leap) in num.items():
            if m == mon and not is_leap:
                start = months[i][1]
                return start + datetime.timedelta(days=day-1)
        return None

    return {
        '설날': day_of(1, 1),
        '부처님오신날': day_of(4, 8),
        '추석': day_of(8, 15),
    }


if __name__ == '__main__':
    import sys
    a = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    b = int(sys.argv[2]) if len(sys.argv) > 2 else a + 6
    W = '일월화수목금토'
    for y in range(a, b + 1):
        r = build_year(y)
        s, bu, c = r['설날'], r['부처님오신날'], r['추석']
        w = lambda x: W[(x.weekday() + 1) % 7]
        print(f"  {y}: ['{s}', '{bu}', '{c}'],   // 설 {w(s)} · 부처님 {w(bu)} · 추석 {w(c)}")
